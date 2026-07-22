<script lang="ts">
  import { auth } from '$lib';
  import { supabase } from '$lib/supabase/client';
  import AppShell from '$lib/components/app-shell.svelte';
  import LoadingState from '$lib/components/loading-state.svelte';
  import {
    formatSubscriptionPeriodEnd,
    isSubscriptionActive,
    PREMIUM_BENEFITS,
    type SubscriptionRow
  } from '$lib/subscription';

  let loading = true;
  let subscription: SubscriptionRow | null = null;
  let actionPending = false;
  let actionError = '';
  let actionSuccess = '';
  let activeUserId: string | null = null;

  $: isActive = isSubscriptionActive(subscription);
  $: periodEndLabel = formatSubscriptionPeriodEnd(subscription);

  async function loadSubscription() {
    const user = $auth.user;

    if (!user) {
      loading = false;
      return;
    }

    loading = true;

    const { data, error } = await supabase.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle();

    if (error) {
      console.error('Error loading subscription:', error);
    }

    subscription = (data as SubscriptionRow | null) ?? null;
    loading = false;
  }

  async function activatePremium() {
    const user = $auth.user;

    if (!user || actionPending) return;

    actionPending = true;
    actionError = '';
    actionSuccess = '';

    try {
      const { data, error } = await supabase.rpc('start_mock_subscription_checkout', {
        target_user_id: user.id
      });

      if (error) throw error;

      subscription = data as SubscriptionRow;
      actionSuccess = '¡Listo! Ya tenés Atrevidos Premium activo.';
    } catch (error) {
      console.error('Error activating mock subscription:', error);
      actionError = 'No pudimos activar tu suscripción. Inténtalo de nuevo en unos segundos.';
    } finally {
      actionPending = false;
    }
  }

  async function cancelPremium() {
    const user = $auth.user;

    if (!user || actionPending) return;

    actionPending = true;
    actionError = '';
    actionSuccess = '';

    try {
      const { data, error } = await supabase.rpc('cancel_mock_subscription', {
        target_user_id: user.id
      });

      if (error) throw error;

      subscription = data as SubscriptionRow;
      actionSuccess = 'Cancelaste tu suscripción. Podés reactivarla cuando quieras.';
    } catch (error) {
      console.error('Error cancelling mock subscription:', error);
      actionError = 'No pudimos cancelar tu suscripción. Inténtalo de nuevo.';
    } finally {
      actionPending = false;
    }
  }

  $: if ($auth.initialized && $auth.user?.id && $auth.user.id !== activeUserId) {
    activeUserId = $auth.user.id;
    void loadSubscription();
  }
</script>

<AppShell active="profile">
  <div class="mx-auto max-w-3xl px-4 py-10">
    <header class="mb-8 text-center">
      <span
        class="inline-flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-700 dark:bg-primary-950/40 dark:text-primary-300"
      >
        Plan único
      </span>
      <h1 class="mt-4 text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">Atrevidos Premium</h1>
      <p class="mx-auto mt-3 max-w-xl text-gray-600 dark:text-gray-400">
        Una sola suscripción, sin niveles confusos. Desbloqueá todo lo que Atrevidos tiene para ofrecer.
      </p>
    </header>

    {#if loading}
      <LoadingState message="Cargando tu suscripción..." />
    {:else}
      <div class="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
        <div class="bg-gradient-to-br from-primary-600 via-primary-500 to-fuchsia-600 px-6 py-8 text-center text-white sm:px-10">
          {#if isActive}
            <p class="text-sm font-semibold uppercase tracking-wide text-white/80">Tu plan está activo</p>
            <p class="mt-2 text-5xl font-extrabold">Premium</p>
            {#if periodEndLabel}
              <p class="mt-2 text-sm text-white/90">Se renueva el {periodEndLabel}</p>
            {/if}
          {:else}
            <p class="text-sm font-semibold uppercase tracking-wide text-white/80">Brasil 🇧🇷 — Mercado Pago</p>
            <p class="mt-2 text-5xl font-extrabold">
              R$&nbsp;19,90<span class="text-lg font-semibold text-white/80">/mês</span>
            </p>
            <p class="mt-2 text-sm text-white/90">
              Precio de referencia para beta en Brasil. Cancelá cuando quieras.
              <span class="block text-white/70">Argentina (ARS) se habilitará más adelante.</span>
            </p>
          {/if}
        </div>

        <div class="px-6 py-8 sm:px-10">
          <ul class="space-y-4">
            {#each PREMIUM_BENEFITS as benefit}
              <li class="flex items-start gap-3">
                <svg class="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-600 dark:text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fill-rule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clip-rule="evenodd"
                  />
                </svg>
                <span class="text-sm text-gray-700 dark:text-gray-200">{benefit}</span>
              </li>
            {/each}
          </ul>

          {#if actionError}
            <p class="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{actionError}</p>
          {/if}

          {#if actionSuccess}
            <p class="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              {actionSuccess}
            </p>
          {/if}

          <div class="mt-8">
            {#if isActive}
              <button
                type="button"
                on:click={cancelPremium}
                disabled={actionPending}
                class="w-full rounded-xl border border-gray-300 px-6 py-4 text-center text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-600 dark:text-gray-200 dark:hover:bg-dark-700"
              >
                {#if actionPending}Cancelando…{:else}Cancelar suscripción{/if}
              </button>
            {:else}
              <button
                type="button"
                on:click={activatePremium}
                disabled={actionPending}
                class="w-full rounded-xl bg-gradient-to-r from-primary-500 to-fuchsia-600 px-6 py-4 text-center text-base font-bold text-white shadow-lg shadow-primary-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {#if actionPending}Activando…{:else}Quiero ser Premium →{/if}
              </button>
              <p class="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
                Modo beta: activación instantánea sin cobro real. Pagos con Mercado Pago Brasil (BRL) próximamente.
              </p>
            {/if}
          </div>
        </div>
      </div>

      <p class="mt-8 text-center text-xs text-gray-400 dark:text-gray-500">
        Los pagos reales se procesarán vía Mercado Pago Brasil (CPF/CNPJ, moneda BRL). No se requiere CUIT argentino.
        Por ahora, esta pantalla funciona en modo de demostración.
      </p>
    {/if}
  </div>
</AppShell>
