<script lang="ts">
  import { auth } from '$lib';
  import { supabase } from '$lib/supabase/client';
  import {
    REPORT_CATEGORY_LABELS,
    REPORT_STATUS_LABELS,
    sortReportsByPriority,
    type AdminReportRow,
    type AdminReportStatus
  } from '$lib/admin';

  let activeUserId: string | null = null;
  let checkingAccess = true;
  let isAdmin = false;
  let loading = false;
  let loadError = '';
  let actionFeedback = '';
  let reports: AdminReportRow[] = [];
  let bannedProfileIds = new Set<string>();
  let actionPendingByReportId: Record<string, boolean> = {};
  let banPendingByUserId: Record<string, boolean> = {};

  async function checkAdminAccess(userId: string) {
    checkingAccess = true;

    const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle();

    if (error) {
      console.error('Error checking admin access:', error);
      isAdmin = false;
      checkingAccess = false;
      return;
    }

    isAdmin = Boolean((data as { is_admin: boolean } | null)?.is_admin);
    checkingAccess = false;

    if (isAdmin) {
      await loadReports();
    }
  }

  async function loadReports() {
    loading = true;
    loadError = '';

    try {
      const { data, error } = await supabase
        .from('reports')
        .select(
          `
            id, reporter_id, target_type, target_id, category, reason, status,
            reviewed_by, reviewed_at, resolution_notes, is_action_taken, created_at,
            reporter:profiles!reports_reporter_id_fkey (id, username, display_name)
          `
        )
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      reports = sortReportsByPriority((data ?? []) as unknown as AdminReportRow[]);

      const userTargetIds = reports.filter((r) => r.target_type === 'user').map((r) => r.target_id);

      if (userTargetIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, is_active')
          .in('id', userTargetIds);

        bannedProfileIds = new Set(
          ((profileRows ?? []) as Array<{ id: string; is_active: boolean | null }>)
            .filter((row) => row.is_active === false)
            .map((row) => row.id)
        );
      } else {
        bannedProfileIds = new Set();
      }
    } catch (error) {
      console.error('Error loading reports:', error);
      loadError = 'No pudimos cargar los reportes ahora mismo.';
    } finally {
      loading = false;
    }
  }

  async function updateReportStatus(report: AdminReportRow, status: AdminReportStatus) {
    const user = $auth.user;

    if (!user || actionPendingByReportId[report.id]) return;

    actionPendingByReportId = { ...actionPendingByReportId, [report.id]: true };
    actionFeedback = '';

    try {
      const { error } = await supabase
        .from('reports')
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          is_action_taken: status === 'resolved'
        } as never)
        .eq('id', report.id);

      if (error) throw error;

      await supabase.from('report_history').insert({
        report_id: report.id,
        action_taken: status,
        performed_by: user.id
      } as never);

      reports = sortReportsByPriority(
        reports.map((r) => (r.id === report.id ? { ...r, status, reviewed_by: user.id, reviewed_at: new Date().toISOString() } : r))
      );
      actionFeedback = `Reporte actualizado a "${REPORT_STATUS_LABELS[status]}".`;
    } catch (error) {
      console.error('Error updating report status:', error);
      actionFeedback = 'No pudimos actualizar el reporte. Inténtalo de nuevo.';
    } finally {
      actionPendingByReportId = { ...actionPendingByReportId, [report.id]: false };
    }
  }

  async function toggleUserBan(userId: string, ban: boolean) {
    if (banPendingByUserId[userId]) return;

    banPendingByUserId = { ...banPendingByUserId, [userId]: true };
    actionFeedback = '';

    try {
      const { error } = await supabase.from('profiles').update({ is_active: !ban } as never).eq('id', userId);

      if (error) throw error;

      const nextBanned = new Set(bannedProfileIds);
      if (ban) {
        nextBanned.add(userId);
      } else {
        nextBanned.delete(userId);
      }
      bannedProfileIds = nextBanned;
      actionFeedback = ban ? 'Usuario suspendido correctamente.' : 'Usuario reactivado correctamente.';
    } catch (error) {
      console.error('Error toggling user ban:', error);
      actionFeedback = 'No pudimos actualizar el estado de esta cuenta. Inténtalo de nuevo.';
    } finally {
      banPendingByUserId = { ...banPendingByUserId, [userId]: false };
    }
  }

  function formatDate(value: string | null) {
    if (!value) return 'Fecha desconocida';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Fecha desconocida';
    return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  $: if ($auth.initialized) {
    if ($auth.user?.id && $auth.user.id !== activeUserId) {
      activeUserId = $auth.user.id;
      void checkAdminAccess($auth.user.id);
    }

    if (!$auth.user) {
      activeUserId = null;
      checkingAccess = false;
      isAdmin = false;
      reports = [];
    }
  }
</script>

<div class="min-h-screen bg-gray-50 px-4 py-8 dark:bg-dark-900">
  <div class="mx-auto max-w-5xl space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <a href="/" class="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">← Volver a Atrevidos</a>
        <h1 class="mt-2 text-3xl font-bold text-gray-900 dark:text-white">Panel de moderación</h1>
      </div>

      {#if isAdmin}
        <button
          type="button"
          on:click={loadReports}
          disabled={loading}
          class="rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if loading}Actualizando…{:else}Actualizar{/if}
        </button>
      {/if}
    </header>

    {#if checkingAccess}
      <section class="rounded-2xl bg-white px-6 py-12 text-center shadow-lg dark:bg-gray-800">
        <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Verificando acceso…</p>
      </section>
    {:else if !$auth.user}
      <section class="rounded-2xl bg-white px-6 py-12 text-center shadow-lg dark:bg-gray-800">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Necesitas iniciar sesión</h2>
        <a href="/login" class="mt-4 inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white">
          Ir a iniciar sesión
        </a>
      </section>
    {:else if !isAdmin}
      <section class="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center shadow-sm dark:border-amber-900 dark:bg-amber-950/30">
        <h2 class="text-lg font-semibold text-amber-800 dark:text-amber-300">No tienes acceso a este panel</h2>
        <p class="mt-2 text-sm text-amber-700 dark:text-amber-400">
          Este panel es exclusivo para el equipo de moderación de Atrevidos.
        </p>
      </section>
    {:else}
      {#if actionFeedback}
        <section class="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-sm dark:bg-emerald-950/30 dark:text-emerald-300">
          {actionFeedback}
        </section>
      {/if}

      {#if loadError}
        <section class="rounded-2xl bg-red-50 px-4 py-4 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{loadError}</section>
      {:else if loading}
        <section class="rounded-2xl bg-white px-6 py-12 text-center shadow-lg dark:bg-gray-800">
          <p class="text-sm text-gray-600 dark:text-gray-400">Cargando reportes…</p>
        </section>
      {:else if reports.length === 0}
        <section class="rounded-2xl bg-white px-6 py-12 text-center shadow-lg dark:bg-gray-800">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">No hay reportes todavía</h2>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Cuando la comunidad reporte contenido, aparecerá aquí.</p>
        </section>
      {:else}
        <section class="space-y-4">
          {#each reports as report (report.id)}
            <article class="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      class={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        report.status === 'pending'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                          : report.status === 'under_review'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                            : report.status === 'resolved'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {REPORT_STATUS_LABELS[report.status ?? 'pending']}
                    </span>
                    <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {REPORT_CATEGORY_LABELS[report.category]}
                    </span>
                    <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      Objetivo: {report.target_type}
                    </span>
                  </div>

                  <p class="mt-3 text-sm text-gray-800 dark:text-gray-200">{report.reason}</p>

                  <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Reportado por {report.reporter?.display_name || report.reporter?.username || 'usuario desconocido'} · {formatDate(report.created_at)}
                  </p>
                </div>

                <div class="flex flex-shrink-0 flex-col gap-2 sm:items-end">
                  <div class="flex gap-2">
                    <button
                      type="button"
                      on:click={() => updateReportStatus(report, 'resolved')}
                      disabled={actionPendingByReportId[report.id] || report.status === 'resolved'}
                      class="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300"
                    >
                      Marcar resuelto
                    </button>
                    <button
                      type="button"
                      on:click={() => updateReportStatus(report, 'dismissed')}
                      disabled={actionPendingByReportId[report.id] || report.status === 'dismissed'}
                      class="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
                    >
                      Desestimar
                    </button>
                  </div>

                  {#if report.target_type === 'user'}
                    {#if bannedProfileIds.has(report.target_id)}
                      <button
                        type="button"
                        on:click={() => toggleUserBan(report.target_id, false)}
                        disabled={banPendingByUserId[report.target_id]}
                        class="rounded-lg border border-primary-300 px-3 py-2 text-xs font-semibold text-primary-700 transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-primary-800 dark:text-primary-300"
                      >
                        Reactivar cuenta reportada
                      </button>
                    {:else}
                      <button
                        type="button"
                        on:click={() => toggleUserBan(report.target_id, true)}
                        disabled={banPendingByUserId[report.target_id]}
                        class="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                      >
                        Suspender cuenta reportada
                      </button>
                    {/if}
                  {/if}
                </div>
              </div>
            </article>
          {/each}
        </section>
      {/if}
    {/if}
  </div>
</div>
