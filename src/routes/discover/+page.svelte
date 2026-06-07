<script lang="ts">
  import { browser } from '$app/environment';
  import { auth } from '$lib/stores/auth';
  import { supabase } from '$lib/supabase/client';
  import ProfileCard from '$lib/components/profile-card.svelte';
  import ReportModal from '$lib/components/report-modal.svelte';
  import {
    applyDiscoverFilters,
    buildDiscoverPassedProfilesStorageKey,
    collectExcludedDiscoverUserIds,
    collectInterestOptions,
    EMPTY_DISCOVER_FILTERS,
    excludeDiscoverProfilesById,
    parseDiscoverPassedProfileIds,
    removeDiscoverProfile,
    serializeDiscoverPassedProfileIds,
    type DiscoverFilters,
    type DiscoverMatchRow,
    type DiscoverProfile
  } from '$lib/discover';
  import { saveDiscoverMatch } from '$lib/discover-actions';
  import { RELATIONSHIP_INTENT_OPTIONS } from '$lib/onboarding';
  import type { ReportTarget } from '$lib/reports';
  import { resolveStorageImageUrl } from '$lib/supabase/profile-media';
  type DiscoverAction = 'like' | 'pass' | 'block';

  let activeUserId: string | null = null;
  let latestRequest = 0;
  let loading = false;
  let loadError = '';
  let allProfiles: DiscoverProfile[] = [];
  let filteredProfiles: DiscoverProfile[] = [];
  let interestOptions: string[] = [];
  let filters: DiscoverFilters = { ...EMPTY_DISCOVER_FILTERS };
  let passedProfileIds = new Set<string>();
  let actionLoadingByProfile: Record<string, boolean> = {};
  let activeActionByProfile: Record<string, DiscoverAction | null> = {};
  let actionErrorByProfile: Record<string, string> = {};
  let actionSuccessMessage = '';
  let reportModalOpen = false;
  let reportTarget: ReportTarget | null = null;

  function readPassedProfileIds(userId: string) {
    if (!browser) {
      return new Set<string>();
    }

    return parseDiscoverPassedProfileIds(
      window.sessionStorage.getItem(buildDiscoverPassedProfilesStorageKey(userId))
    );
  }

  function persistPassedProfileIds(userId: string, profileIds: ReadonlySet<string>) {
    if (!browser) {
      return;
    }

    window.sessionStorage.setItem(
      buildDiscoverPassedProfilesStorageKey(userId),
      serializeDiscoverPassedProfileIds(profileIds)
    );
  }

  function rememberPassedProfile(userId: string, profileId: string) {
    const nextPassedProfileIds = new Set(passedProfileIds);
    nextPassedProfileIds.add(profileId);
    passedProfileIds = nextPassedProfileIds;
    persistPassedProfileIds(userId, nextPassedProfileIds);
  }

  async function resolveDiscoverProfileAvatars(profiles: DiscoverProfile[]) {
    const resolvedAvatarUrls = await Promise.allSettled(
      profiles.map((profile) => resolveStorageImageUrl(profile.avatar_url))
    );

    return profiles.map((profile, index) => ({
      ...profile,
      avatar_url: resolvedAvatarUrls[index]?.status === 'fulfilled' ? (resolvedAvatarUrls[index].value ?? null) : null
    }));
  }

  async function loadDiscoverProfiles() {
    const user = $auth.user;

    if (!user) {
      return;
    }

    const requestId = ++latestRequest;
    loading = true;
    loadError = '';

    try {
      const excludedMatchesPromise = loadExcludedDiscoverMatchRows(user.id);
      const profilesPromise = supabase
        .from('profiles')
        .select(
          'id, username, display_name, avatar_url, bio, location, interests, relationship_intent, last_active_at, is_active, onboarding_completed_at, age_confirmed, consent_acknowledged'
        )
        .eq('is_active', true)
        .eq('age_confirmed', true)
        .eq('consent_acknowledged', true)
        .not('onboarding_completed_at', 'is', null)
        .neq('id', user.id)
        .order('last_active_at', { ascending: false, nullsFirst: false });

      const [{ data: matchRows, error: matchesError }, { data: profileRows, error: profilesError }] =
        await Promise.all([excludedMatchesPromise, profilesPromise]);

      if (matchesError) {
        throw matchesError;
      }

      if (profilesError) {
        throw profilesError;
      }

      if (requestId !== latestRequest || $auth.user?.id !== user.id) {
        return;
      }

      const excludedUserIds = collectExcludedDiscoverUserIds(
        (matchRows ?? []) as DiscoverMatchRow[],
        user.id
      );
      const storedPassedProfileIds = readPassedProfileIds(user.id);
      const excludedProfileIds = new Set([...excludedUserIds, ...storedPassedProfileIds]);
      const visibleProfiles = excludeDiscoverProfilesById((profileRows ?? []) as DiscoverProfile[], excludedProfileIds);
      const resolvedProfiles = await resolveDiscoverProfileAvatars(visibleProfiles);

      if (requestId !== latestRequest || $auth.user?.id !== user.id) {
        return;
      }

      allProfiles = resolvedProfiles;
      interestOptions = collectInterestOptions(allProfiles);
      filteredProfiles = applyDiscoverFilters(allProfiles, filters);
      activeUserId = user.id;
      passedProfileIds = storedPassedProfileIds;
      actionLoadingByProfile = {};
      activeActionByProfile = {};
      actionErrorByProfile = {};
      actionSuccessMessage = '';
    } catch (error) {
      if (requestId !== latestRequest || $auth.user?.id !== user.id) {
        return;
      }

      console.error('Error loading discover profiles:', error);
      loadError = 'No pudimos cargar perfiles ahora mismo. Inténtalo de nuevo.';
      allProfiles = [];
      filteredProfiles = [];
      interestOptions = [];
    } finally {
      if (requestId === latestRequest) {
        loading = false;
      }
    }
  }

  function loadExcludedDiscoverMatchRows(userId: string) {
    return supabase
      .from('matches')
      .select('user_id, target_user_id, match_type')
      .in('match_type', ['like', 'super-like', 'block'])
      .or(`user_id.eq.${userId},target_user_id.eq.${userId}`);
  }

  function applyFilters() {
    filteredProfiles = applyDiscoverFilters(allProfiles, filters);
  }

  function resetFilters() {
    filters = { ...EMPTY_DISCOVER_FILTERS };
    applyFilters();
  }

  function removeProfileFromLists(profileId: string) {
    const nextAllProfiles = removeDiscoverProfile(allProfiles, profileId);
    const nextFilteredProfiles = removeDiscoverProfile(filteredProfiles, profileId);

    allProfiles = nextAllProfiles;
    filteredProfiles = nextFilteredProfiles;
    interestOptions = collectInterestOptions(nextAllProfiles);
    actionLoadingByProfile = { ...actionLoadingByProfile, [profileId]: false };
    activeActionByProfile = { ...activeActionByProfile, [profileId]: null };
    actionErrorByProfile = { ...actionErrorByProfile, [profileId]: '' };
  }

  async function handleProfileAction(event: CustomEvent<{ profile: DiscoverProfile; action: DiscoverAction }>) {
    const user = $auth.user;
    const { profile, action } = event.detail;

    if (!user) {
      actionErrorByProfile = {
        ...actionErrorByProfile,
        [profile.id]: 'Necesitas iniciar sesión para realizar esta acción.'
      };
      return;
    }

    actionSuccessMessage = '';
    actionLoadingByProfile = { ...actionLoadingByProfile, [profile.id]: true };
    activeActionByProfile = { ...activeActionByProfile, [profile.id]: action };
    actionErrorByProfile = { ...actionErrorByProfile, [profile.id]: '' };

    try {
      if (action === 'pass') {
        rememberPassedProfile(user.id, profile.id);
        actionSuccessMessage = `Has pasado el perfil de ${profile.display_name || profile.username}.`;
        removeProfileFromLists(profile.id);
        return;
      }

      const savedMatch = await saveDiscoverMatch(user.id, profile.id, action);
      actionSuccessMessage =
        action === 'block'
          ? `Has bloqueado a ${profile.display_name || profile.username}.`
          : savedMatch.is_mutual
            ? `¡Es un match! Tú y ${profile.display_name || profile.username} os gustáis.`
            : `Te ha gustado el perfil de ${profile.display_name || profile.username}.`;

      removeProfileFromLists(profile.id);
    } catch (error) {
      console.error(`Error performing ${action} on discover profile:`, error);
      actionErrorByProfile = {
        ...actionErrorByProfile,
        [profile.id]:
          action === 'block'
            ? 'No pudimos bloquear este perfil. Inténtalo de nuevo.'
            : action === 'like'
              ? 'No pudimos guardar tu like. Inténtalo de nuevo.'
              : 'No pudimos procesar esta acción. Inténtalo de nuevo.'
      };
      actionLoadingByProfile = { ...actionLoadingByProfile, [profile.id]: false };
      activeActionByProfile = { ...activeActionByProfile, [profile.id]: null };
    }
  }

  function openProfileReport(event: CustomEvent<{ profile: DiscoverProfile }>) {
    const { profile } = event.detail;

    reportTarget = {
      type: 'user',
      id: profile.id,
      ownerId: profile.id,
      label: `el perfil de ${profile.display_name || profile.username || 'esta persona'}`
    };
    reportModalOpen = true;
    actionSuccessMessage = '';
  }

  function closeReportModal() {
    reportModalOpen = false;
    reportTarget = null;
  }

  function handleReportSubmitted(event: CustomEvent<{ message: string; target: ReportTarget }>) {
    actionSuccessMessage = event.detail.message;
    closeReportModal();
  }

  $: if ($auth.initialized) {
    if ($auth.user?.id && $auth.user.id !== activeUserId) {
      activeUserId = $auth.user.id;
      void loadDiscoverProfiles();
    }

    if (!$auth.user) {
      latestRequest += 1;
      activeUserId = null;
      loading = false;
      loadError = '';
      allProfiles = [];
      filteredProfiles = [];
      interestOptions = [];
      filters = { ...EMPTY_DISCOVER_FILTERS };
      passedProfileIds = new Set<string>();
      actionLoadingByProfile = {};
      activeActionByProfile = {};
      actionErrorByProfile = {};
      actionSuccessMessage = '';
      reportModalOpen = false;
      reportTarget = null;
    }
  }

  $: visibleCount = filteredProfiles.length;
</script>

<div class="min-h-screen bg-gray-50 px-4 py-6 dark:bg-gray-900">
  <div class="mx-auto max-w-6xl space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <a
          href="/"
          class="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <span aria-hidden="true">←</span>
          Volver al feed
        </a>
        <h1 class="mt-3 text-3xl font-bold text-gray-900 dark:text-white">Descubrir personas</h1>
        <p class="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
          Explora perfiles activos y encuentra personas cerca de ti o con intereses similares.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <a
          href="/matches"
          class="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Matches
        </a>
        <a
          href="/messages"
          class="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Mensajes
        </a>
        <a
          href="/profile"
          class="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Mi perfil
        </a>
        <button
          type="button"
          on:click={loadDiscoverProfiles}
          disabled={loading}
          class="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if loading}Actualizando…{:else}Actualizar{/if}
        </button>
      </div>
    </header>

    {#if actionSuccessMessage}
      <section class="rounded-2xl bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700 shadow-sm dark:bg-emerald-950/30 dark:text-emerald-300">
        <p>{actionSuccessMessage}</p>
      </section>
    {/if}

    <section class="rounded-2xl bg-white p-4 shadow-lg dark:bg-gray-800 sm:p-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-gray-900 dark:text-white">Filtros rápidos</p>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{visibleCount} perfiles visibles</p>
        </div>

        <button
          type="button"
          on:click={resetFilters}
          class="text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Limpiar
        </button>
      </div>

      <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label for="location-filter" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
            Ciudad o zona
          </label>
          <input
            id="location-filter"
            type="text"
            bind:value={filters.location}
            on:input={applyFilters}
            placeholder="Ej. Madrid"
            class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          />
        </div>

        <div>
          <label for="interest-filter" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
            Interés
          </label>
          <input
            id="interest-filter"
            list="discover-interests"
            type="text"
            bind:value={filters.interest}
            on:input={applyFilters}
            placeholder="Ej. café"
            class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          />
          <datalist id="discover-interests">
            {#each interestOptions as interest}
              <option value={interest}></option>
            {/each}
          </datalist>
        </div>

        <div>
          <label for="intent-filter" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
            Intención
          </label>
          <select
            id="intent-filter"
            bind:value={filters.relationshipIntent}
            on:change={applyFilters}
            class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          >
            <option value="">Todas</option>
            {#each RELATIONSHIP_INTENT_OPTIONS as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>

        <label class="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-200">
          <input
            type="checkbox"
            bind:checked={filters.onlineRecentlyOnly}
            on:change={applyFilters}
            class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Solo en línea recientemente
        </label>
      </div>
    </section>

    {#if loadError}
      <section class="rounded-2xl bg-red-50 px-4 py-5 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
        <p>{loadError}</p>
      </section>
    {:else if loading}
      <section class="rounded-2xl bg-white px-4 py-12 text-center shadow-lg dark:bg-gray-800">
        <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Buscando perfiles para ti…</p>
      </section>
    {:else if visibleCount === 0 && allProfiles.length > 0}
      <section class="rounded-2xl bg-white px-4 py-10 text-center shadow-lg dark:bg-gray-800">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">No encontramos coincidencias con esos filtros</h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Prueba otra ciudad, interés o quita el filtro de actividad reciente.
        </p>
      </section>
    {:else if allProfiles.length === 0}
      <section class="rounded-2xl bg-white px-4 py-10 text-center shadow-lg dark:bg-gray-800">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Todavía no hay perfiles para descubrir</h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Cuando más personas completen su perfil, aparecerán aquí automáticamente.
        </p>
      </section>
    {:else}
      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each filteredProfiles as profile (profile.id)}
          <ProfileCard
            {profile}
            actionLoading={actionLoadingByProfile[profile.id] ?? false}
            activeAction={activeActionByProfile[profile.id] ?? null}
            actionError={actionErrorByProfile[profile.id] ?? ''}
            on:action={handleProfileAction}
            on:report={openProfileReport}
          />
        {/each}
      </section>
    {/if}
  </div>
</div>

<ReportModal
  open={reportModalOpen}
  reporterId={$auth.user?.id ?? null}
  target={reportTarget}
  on:close={closeReportModal}
  on:submitted={handleReportSubmitted}
/>
