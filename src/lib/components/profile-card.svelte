<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { RELATIONSHIP_INTENT_OPTIONS } from '$lib/onboarding';
  import {
    formatLastActiveDate,
    isRecentlyOnline,
    type DiscoverProfile
  } from '$lib/discover';

  export let profile: DiscoverProfile;
  export let actionLoading = false;
  export let activeAction: 'like' | 'pass' | 'block' | 'super-like' | null = null;
  export let actionError = '';
  export let hasActiveSubscription = false;

  const dispatch = createEventDispatcher<{
    action: { profile: DiscoverProfile; action: 'like' | 'pass' | 'block' | 'super-like' };
    report: { profile: DiscoverProfile };
  }>();

  const relationshipIntentLabels = new Map(
    RELATIONSHIP_INTENT_OPTIONS.map((option) => [option.value, option.label])
  );

  $: displayName = profile.display_name || profile.username || 'Usuario';
  $: handleLabel = profile.username ? `@${profile.username}` : '@sin-handle';
  $: profileInitial = (displayName.trim()[0] || 'U').toUpperCase();
  $: intentLabel = profile.relationship_intent
    ? relationshipIntentLabels.get(profile.relationship_intent) ?? 'Sin definir'
    : 'Sin definir';
  $: recentlyOnline = isRecentlyOnline(profile.last_active_at);
  $: lastSeenLabel = formatLastActiveDate(profile.last_active_at);

  function dispatchAction(action: 'like' | 'pass' | 'block' | 'super-like') {
    dispatch('action', { profile, action });
  }

  function dispatchReport() {
    dispatch('report', { profile });
  }
</script>

<article class="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
  <div class="h-24 bg-gradient-to-r from-primary-500 via-fuchsia-500 to-rose-500"></div>

  <div class="px-4 pb-5">
    <div class="-mt-10 flex items-end justify-between gap-3">
      {#if profile.avatar_url}
        <img
          src={profile.avatar_url}
          alt={displayName}
          class="h-20 w-20 rounded-2xl border-4 border-white object-cover shadow-md dark:border-gray-800"
        />
      {:else}
        <div class="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-primary-100 text-2xl font-bold text-primary-600 shadow-md dark:border-gray-800 dark:bg-primary-900 dark:text-primary-300">
          {profileInitial}
        </div>
      {/if}

      <span
        class={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${recentlyOnline ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-300'}`}
      >
        {#if recentlyOnline}
          En línea recientemente
        {:else}
          Activa/o {lastSeenLabel}
        {/if}
      </span>
    </div>

    <div class="mt-4 space-y-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">{displayName}</h2>
          {#if profile.is_verified}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
              title="Perfil verificado"
            >
              <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clip-rule="evenodd"
                />
              </svg>
              Verificada/o
            </span>
          {/if}
          <span class="text-sm text-gray-500 dark:text-gray-400">{handleLabel}</span>
        </div>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">{profile.location || 'Ubicación no indicada'}</p>
      </div>

      <p class="text-sm leading-6 text-gray-700 dark:text-gray-200">
        {profile.bio || 'Esta persona todavía no añadió una biografía.'}
      </p>

      <div class="flex flex-wrap gap-2">
        <span class="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 dark:bg-primary-950/50 dark:text-primary-200">
          {intentLabel}
        </span>

        {#each profile.interests ?? [] as interest (interest)}
          <span class="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-200">
            #{interest}
          </span>
        {/each}
      </div>

      {#if actionError}
        <p class="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {actionError}
        </p>
      {/if}

      <div class="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
        <button
          type="button"
          on:click={() => dispatchAction('pass')}
          disabled={actionLoading}
          class="inline-flex items-center justify-center rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-900"
        >
          {#if actionLoading && activeAction === 'pass'}Pasando…{:else}Pasar{/if}
        </button>

        <button
          type="button"
          on:click={() => dispatchAction('like')}
          disabled={actionLoading}
          class="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if actionLoading && activeAction === 'like'}Dando like…{:else}Like{/if}
        </button>

        <button
          type="button"
          on:click={() => dispatchAction('super-like')}
          disabled={actionLoading}
          title={hasActiveSubscription ? 'Super-like' : 'Super-like es una función Premium'}
          class="relative inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-primary-500 to-fuchsia-600 px-3 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if actionLoading && activeAction === 'super-like'}
            Enviando…
          {:else}
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.538 1.118l-3.367-2.446a1 1 0 00-1.176 0l-3.367 2.446c-.783.57-1.838-.196-1.538-1.118l1.287-3.957a1 1 0 00-.363-1.118L2.063 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.285-3.958z"
              />
            </svg>
            Super-like
            {#if !hasActiveSubscription}
              <span class="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[9px] font-bold text-primary-700">PRO</span>
            {/if}
          {/if}
        </button>

        <button
          type="button"
          on:click={() => dispatchAction('block')}
          disabled={actionLoading}
          class="inline-flex items-center justify-center rounded-xl bg-red-600 px-3 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if actionLoading && activeAction === 'block'}Bloqueando…{:else}Bloquear{/if}
        </button>
      </div>

      <button
        type="button"
        on:click={dispatchReport}
        class="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
      >
        Reportar perfil
      </button>
    </div>
  </div>
</article>
