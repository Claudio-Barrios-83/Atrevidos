<script lang="ts">
  import { auth } from '$lib';
  import { supabase } from '$lib/supabase/client';
  import { resolveStorageImageUrl } from '$lib/supabase/profile-media';
  import {
    createDirectConversationRecoveryClient,
    recoverDirectConversationIds
  } from '$lib/direct-conversation-recovery';
  import { RELATIONSHIP_INTENT_OPTIONS } from '$lib/onboarding';
  import {
    buildMatchListItems,
    collectBlockedMatchUserIds,
    indexConversationIdsByMatchedUser,
    removeMatchListItemsByUser,
    type ConversationParticipantRow,
    type ConversationRow,
    type MatchListItem,
    type MatchVisibilityRow,
    type MutualMatchRow
  } from '$lib/matches';
  import { saveDiscoverMatch } from '$lib/discover-actions';
  import AppShell from '$lib/components/app-shell.svelte';
  import { isSubscriptionActive, type SubscriptionRow } from '$lib/subscription';

  const CONVERSATION_PARTICIPANTS_TABLE = 'conversation_participants' as never;
  const CONVERSATIONS_TABLE = 'conversations' as never;
  const relationshipIntentLabels = new Map(
    RELATIONSHIP_INTENT_OPTIONS.map((option) => [option.value, option.label])
  );

  type MatchCard = MatchListItem & {
    hasConversation: boolean;
    conversationId: string | null;
  };

  type IncomingLike = {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    matchType: string;
  };

  let activeUserId: string | null = null;
  let latestRequest = 0;
  let loading = false;
  let loadError = '';
  let matches: MatchCard[] = [];
  let blockFeedback = '';
  let blockLoadingByUser: Record<string, boolean> = {};
  let locallyBlockedMatchUserIds = new Set<string>();
  let subscription: SubscriptionRow | null = null;
  let incomingLikes: IncomingLike[] = [];
  let signingOut = false;

  $: hasActiveSubscription = isSubscriptionActive(subscription);

  async function loadSubscriptionStatus(userId: string) {
    const { data } = await supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
    subscription = (data as SubscriptionRow | null) ?? null;
  }

  async function loadIncomingLikes(userId: string) {
    // Gracias a la policy matches_select_own, esta consulta solo devuelve
    // filas si el usuario tiene suscripcion activa (o si ya es match mutuo,
    // que se filtra explicitamente aqui porque esos ya se muestran arriba).
    const { data, error } = await supabase
      .from('matches')
      .select(
        `
          id,
          match_type,
          is_mutual,
          profile:profiles!matches_user_id_fkey ( id, username, display_name, avatar_url )
        `
      )
      .eq('target_user_id', userId)
      .eq('is_mutual', false)
      .in('match_type', ['like', 'super-like']);

    if (error) {
      console.error('Error loading incoming likes:', error);
      incomingLikes = [];
      return;
    }

    const rows = (data ?? []) as unknown as Array<{
      id: string;
      match_type: string;
      profile: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
    }>;

    const resolved = await Promise.all(
      rows
        .filter((row) => row.profile)
        .map(async (row) => ({
          id: row.id,
          matchType: row.match_type,
          displayName: row.profile!.display_name || row.profile!.username,
          username: row.profile!.username,
          avatarUrl: await resolveStorageImageUrl(row.profile!.avatar_url)
        }))
    );

    incomingLikes = resolved;
  }

  async function handleSignOut() {
    if (signingOut) return;
    signingOut = true;
    try {
      await auth.signOut();
    } finally {
      signingOut = false;
    }
  }

  function formatMatchedDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Fecha no disponible';
    }

    return date.toLocaleDateString('es');
  }

  async function resolveMatchAvatars(items: MatchListItem[]) {
    const resolvedAvatarUrls = await Promise.allSettled(
      items.map((item) => resolveStorageImageUrl(item.avatarUrl))
    );

    return items.map((item, index) => ({
      ...item,
      avatarUrl: resolvedAvatarUrls[index]?.status === 'fulfilled' ? (resolvedAvatarUrls[index].value ?? null) : null
    }));
  }

  async function loadConversationIdsByMatchedUser(activeUserId: string, matchedUserIds: string[]) {
    if (matchedUserIds.length === 0) {
      return {};
    }

    const { data: candidateParticipantRows, error: participantsError } = await supabase
      .from(CONVERSATION_PARTICIPANTS_TABLE)
      .select('conversation_id, user_id, is_active')
      .in('user_id', [activeUserId, ...matchedUserIds]);

    if (participantsError) {
      throw participantsError;
    }

    const conversationIds = Array.from(
      new Set(((candidateParticipantRows ?? []) as ConversationParticipantRow[]).map((row) => row.conversation_id))
    );

    if (conversationIds.length === 0) {
      return {};
    }

    const [
      { data: conversations, error: conversationsError },
      { data: fullParticipantRows, error: fullParticipantsError }
    ] = await Promise.all([
      supabase
        .from(CONVERSATIONS_TABLE)
        .select('id, is_group')
        .in('id', conversationIds),
      supabase
        .from(CONVERSATION_PARTICIPANTS_TABLE)
        .select('conversation_id, user_id, is_active')
        .in('conversation_id', conversationIds)
    ]);

    if (conversationsError) {
      throw conversationsError;
    }

    if (fullParticipantsError) {
      throw fullParticipantsError;
    }

    return indexConversationIdsByMatchedUser(
      activeUserId,
      matchedUserIds,
      (fullParticipantRows ?? []) as ConversationParticipantRow[],
      (conversations ?? []) as ConversationRow[]
    );
  }

  async function loadMatches() {
    const user = $auth.user;

    if (!user) {
      matches = [];
      loading = false;
      loadError = '';
      return;
    }

    const requestId = ++latestRequest;
    loading = true;
    loadError = '';

    try {
      const blockedRowsPromise = supabase
        .from('matches')
        .select('user_id, target_user_id, match_type')
        .eq('match_type', 'block')
        .or(`user_id.eq.${user.id},target_user_id.eq.${user.id}`);

      const mutualMatchesPromise = supabase
        .from('matches')
        .select(
          `
            id,
            target_user_id,
            match_type,
            created_at,
            target_profile:profiles!matches_target_user_id_fkey (
              id,
              username,
              display_name,
              avatar_url,
              location,
              interests,
              relationship_intent
            )
          `
        )
        .eq('user_id', user.id)
        .eq('is_mutual', true)
        .in('match_type', ['like', 'super-like'])
        .order('created_at', { ascending: false });

      const [
        { data: blockedRows, error: blockedRowsError },
        { data, error }
      ] = await Promise.all([blockedRowsPromise, mutualMatchesPromise]);

      if (blockedRowsError) {
        throw blockedRowsError;
      }

      if (error) {
        throw error;
      }

      if (requestId !== latestRequest || $auth.user?.id !== user.id) {
        return;
      }

      const blockedUserIds = collectBlockedMatchUserIds((blockedRows ?? []) as MatchVisibilityRow[], user.id);
      for (const blockedUserId of locallyBlockedMatchUserIds) {
        blockedUserIds.add(blockedUserId);
      }
      const items = buildMatchListItems((data ?? []) as unknown as MutualMatchRow[], blockedUserIds);
      const resolvedItems = await resolveMatchAvatars(items);
      const conversationIdByMatchedUser = await loadConversationIdsByMatchedUser(
        user.id,
        resolvedItems.map((item) => item.matchedUserId)
      );
      const recoveredConversationIds = await recoverDirectConversationIds({
        activeUserId: user.id,
        candidateUserIds: resolvedItems
          .map((item) => item.matchedUserId)
          .filter((matchedUserId) => !conversationIdByMatchedUser[matchedUserId]),
        blockedUserIds,
        mutualUserIds: new Set(resolvedItems.map((item) => item.matchedUserId)),
        supabase: createDirectConversationRecoveryClient(supabase)
      });
      const completeConversationIdByMatchedUser = {
        ...conversationIdByMatchedUser,
        ...recoveredConversationIds
      };

      if (requestId !== latestRequest || $auth.user?.id !== user.id) {
        return;
      }

      matches = resolvedItems.map((item) => ({
        ...item,
        hasConversation: Boolean(completeConversationIdByMatchedUser[item.matchedUserId]),
        conversationId: completeConversationIdByMatchedUser[item.matchedUserId] ?? null
      }));
    } catch (error) {
      if (requestId !== latestRequest || $auth.user?.id !== user.id) {
        return;
      }

      console.error('Error loading matches:', error);
      matches = [];
      loadError = 'No pudimos cargar tus matches ahora mismo. Inténtalo de nuevo.';
    } finally {
      if (requestId === latestRequest) {
        loading = false;
      }
    }
  }

  async function blockMatch(match: MatchCard) {
    const user = $auth.user;

    if (!user) {
      loadError = 'Tu sesión expiró. Vuelve a iniciar sesión para bloquear perfiles.';
      return;
    }

    if (blockLoadingByUser[match.matchedUserId]) {
      return;
    }

    loadError = '';
    blockFeedback = '';
    blockLoadingByUser = { ...blockLoadingByUser, [match.matchedUserId]: true };
    latestRequest += 1;
    locallyBlockedMatchUserIds = new Set([...locallyBlockedMatchUserIds, match.matchedUserId]);

    try {
      await saveDiscoverMatch(user.id, match.matchedUserId, 'block');
      matches = removeMatchListItemsByUser(matches, match.matchedUserId);
      blockFeedback = `Has bloqueado a ${match.displayName || match.username}. Este match y su acceso al chat se ocultaron.`;
    } catch (error) {
      console.error('Error blocking match:', error);
      locallyBlockedMatchUserIds = new Set(
        [...locallyBlockedMatchUserIds].filter((blockedUserId) => blockedUserId !== match.matchedUserId)
      );
      loadError = 'No pudimos bloquear este match. Inténtalo de nuevo.';
    } finally {
      blockLoadingByUser = { ...blockLoadingByUser, [match.matchedUserId]: false };
    }
  }

  $: if ($auth.initialized) {
    if ($auth.user?.id && $auth.user.id !== activeUserId) {
      activeUserId = $auth.user.id;
      void loadMatches();
      void loadSubscriptionStatus($auth.user.id);
      void loadIncomingLikes($auth.user.id);
    }

    if (!$auth.user) {
      latestRequest += 1;
      activeUserId = null;
      loading = false;
      loadError = '';
      matches = [];
      blockFeedback = '';
      blockLoadingByUser = {};
      locallyBlockedMatchUserIds = new Set();
      subscription = null;
      incomingLikes = [];
    }
  }
</script>

<AppShell active="matches" onSignOut={handleSignOut} {signingOut}>
<div class="min-h-screen bg-gray-50 px-4 py-6 dark:bg-dark-900">
  <div class="mx-auto max-w-6xl space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Tus matches</h1>
        <p class="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
          Aquí aparecen los likes mutuos. Atrevidos intenta preparar el chat directo automáticamente para que puedas abrirlo
          desde aquí o desde tu bandeja cuando ya esté disponible.
        </p>
      </div>

      <button
        type="button"
        on:click={loadMatches}
        disabled={loading}
        class="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if loading}Actualizando…{:else}Actualizar{/if}
      </button>
    </header>

    <section class="rounded-2xl bg-white p-5 shadow-lg dark:bg-dark-800">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">A quién le gustás</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Personas que ya te dieron like o super-like, antes de que sea match mutuo.
          </p>
        </div>
        {#if !hasActiveSubscription}
          <a
            href="/subscription"
            class="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-primary-500 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110"
          >
            Ver con Premium
          </a>
        {/if}
      </div>

      {#if !hasActiveSubscription}
        <div class="mt-4 flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-4 dark:bg-dark-900">
          <div class="flex -space-x-2">
            {#each { length: 3 } as _, i}
              <div class="h-10 w-10 rounded-full border-2 border-white bg-gray-300 blur-sm dark:border-dark-800 dark:bg-dark-600"></div>
            {/each}
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Suscribite a Atrevidos Premium para ver quién te dio like antes de que sea match.
          </p>
        </div>
      {:else if incomingLikes.length === 0}
        <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">Todavía nadie te dio like. ¡Completá tu perfil para destacar!</p>
      {:else}
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each incomingLikes as like (like.id)}
            <div class="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-3 dark:bg-dark-900">
              {#if like.avatarUrl}
                <img src={like.avatarUrl} alt={like.displayName} class="h-10 w-10 rounded-full object-cover" />
              {:else}
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 font-bold text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
                  {(like.displayName.trim()[0] || 'U').toUpperCase()}
                </div>
              {/if}
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-gray-900 dark:text-white">{like.displayName}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {like.matchType === 'super-like' ? '⭐ Te dio un super-like' : 'Te dio like'}
                </p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    {#if blockFeedback}
      <section class="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
        <p>{blockFeedback}</p>
      </section>
    {/if}

    {#if loading}
      <section class="rounded-2xl bg-white px-6 py-12 text-center shadow-lg dark:bg-gray-800">
        <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Buscando matches mutuos…</p>
      </section>
    {:else if loadError}
      <section class="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        <p>{loadError}</p>
      </section>
    {:else if matches.length === 0}
      <section class="rounded-2xl bg-white px-6 py-12 text-center shadow-lg dark:bg-gray-800">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Aún no hay matches mutuos</h2>
        <p class="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Cuando dos personas se den like entre sí, aparecerán aquí y podrán pasar a la bandeja de mensajes.
        </p>
        <a
          href="/discover"
          class="mt-6 inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
        >
          Seguir descubriendo
        </a>
      </section>
    {:else}
      <section class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {#each matches as match (match.id)}
          <article class="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div class="h-24 bg-gradient-to-r from-primary-500 via-fuchsia-500 to-rose-500"></div>

            <div class="px-5 pb-5">
              <div class="-mt-10 flex items-end justify-between gap-3">
                {#if match.avatarUrl}
                  <img
                    src={match.avatarUrl}
                    alt={match.displayName}
                    class="h-20 w-20 rounded-2xl border-4 border-white object-cover shadow-md dark:border-gray-800"
                  />
                {:else}
                  <div class="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-primary-100 text-2xl font-bold text-primary-600 shadow-md dark:border-gray-800 dark:bg-primary-900 dark:text-primary-300">
                    {(match.displayName.trim()[0] || 'U').toUpperCase()}
                  </div>
                {/if}

                <span class="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  Match mutuo
                </span>
              </div>

              <div class="mt-4 space-y-4">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">{match.displayName}</h2>
                    <span class="text-sm text-gray-500 dark:text-gray-400">@{match.username}</span>
                  </div>
                  <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">{match.location || 'Ubicación no indicada'}</p>
                  <p class="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Match desde {formatMatchedDate(match.matchedAt)}
                  </p>
                </div>

                <div class="flex flex-wrap gap-2">
                  <span class="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 dark:bg-primary-950/50 dark:text-primary-200">
                    {match.relationshipIntent
                      ? relationshipIntentLabels.get(match.relationshipIntent) ?? 'Sin definir'
                      : 'Sin definir'}
                  </span>

                  {#each match.interests as interest (interest)}
                    <span class="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                      #{interest}
                    </span>
                  {/each}
                </div>

                <div class={`rounded-2xl px-4 py-4 text-sm ${match.hasConversation ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200' : 'bg-primary-50 text-primary-800 dark:bg-primary-950/30 dark:text-primary-200'}`}>
                  {#if match.hasConversation}
                    <p class="font-semibold">Chat listo para abrir.</p>
                    <p class="mt-1">
                      Ya detectamos una conversación directa activa para este match.
                    </p>
                  {:else}
                    <p class="font-semibold">Match confirmado.</p>
                    <p class="mt-1">
                      Si el chat todavía no aparece, puedes refrescar o entrar a la bandeja para reintentar la sincronización.
                    </p>
                  {/if}
                </div>

                <div class="grid gap-3 sm:grid-cols-2">
                  <a
                    href={match.conversationId ? `/messages/${match.conversationId}` : '/messages'}
                    class="inline-flex w-full items-center justify-center rounded-xl border border-primary-300 px-4 py-3 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 dark:border-primary-700 dark:text-primary-300 dark:hover:bg-primary-950/30"
                  >
                    {match.hasConversation ? 'Abrir chat' : 'Ir a mensajes'}
                  </a>

                  <button
                    type="button"
                    on:click={() => blockMatch(match)}
                    disabled={blockLoadingByUser[match.matchedUserId]}
                    class="inline-flex w-full items-center justify-center rounded-xl border border-rose-300 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
                  >
                    {#if blockLoadingByUser[match.matchedUserId]}Bloqueando…{:else}Bloquear{/if}
                  </button>
                </div>
              </div>
            </div>
          </article>
        {/each}
      </section>
    {/if}
  </div>
</div>
</AppShell>
