<script lang="ts">
  import { auth } from '$lib';
  import {
    buildConversationListItems,
    finalizeConversationListItems,
    type ConversationListItem,
    type ConversationMatchRow,
    type ConversationParticipantRow,
    type UserConversationRow
  } from '$lib/conversations';
  import {
    createDirectConversationRecoveryClient,
    recoverDirectConversationIds
  } from '$lib/direct-conversation-recovery';
  import { supabase } from '$lib/supabase/client';
  import { resolveStorageImageUrl } from '$lib/supabase/profile-media';
  import AppShell from '$lib/components/app-shell.svelte';

  const USER_CONVERSATIONS_VIEW = 'user_conversations' as never;
  const CONVERSATION_PARTICIPANTS_TABLE = 'conversation_participants' as never;
  const MATCHES_TABLE = 'matches' as never;
  const PROFILES_TABLE = 'profiles' as never;

  let activeUserId: string | null = null;
  let latestRequest = 0;
  let loading = false;
  let loadError = '';
  let conversations: ConversationListItem[] = [];
  let signingOut = false;

  async function handleSignOut() {
    if (signingOut) return;
    signingOut = true;
    try {
      await auth.signOut();
    } finally {
      signingOut = false;
    }
  }

  function formatLastActivity(value: string | null) {
    if (!value) {
      return 'Actividad desconocida';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Actividad desconocida';
    }

    return new Intl.DateTimeFormat('es', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  function formatMessagePreview(item: ConversationListItem) {
    if (!item.lastMessagePreview) {
      return 'Aún no hay mensajes en esta conversación.';
    }

    return item.lastMessageSenderName
      ? `${item.lastMessageSenderName}: ${item.lastMessagePreview}`
      : item.lastMessagePreview;
  }

  async function resolveConversationAvatars(items: ConversationListItem[]) {
    const resolvedAvatarUrls = await Promise.allSettled(
      items.map((item) => resolveStorageImageUrl(item.counterpartAvatarUrl))
    );

    return items.map((item, index) => ({
      ...item,
      counterpartAvatarUrl:
        resolvedAvatarUrls[index]?.status === 'fulfilled' ? (resolvedAvatarUrls[index].value ?? null) : null
    }));
  }

  async function loadConversations() {
    const user = $auth.user;

    if (!user) {
      conversations = [];
      loading = false;
      loadError = '';
      return;
    }

    const requestId = ++latestRequest;
    loading = true;
    loadError = '';

    try {
      const { data: conversationRows, error: conversationsError } = await supabase
        .from(USER_CONVERSATIONS_VIEW)
        .select(
          'id, is_group, name, avatar_url, last_message_at, created_at, last_message_content, last_message_time, last_message_sender, unread_count, last_message_media_url'
        )
        .eq('is_group', false)
        .order('last_message_time', { ascending: false, nullsFirst: false })
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (conversationsError) {
        throw conversationsError;
      }

      if (requestId !== latestRequest || $auth.user?.id !== user.id) {
        return;
      }

      const conversationIds = ((conversationRows ?? []) as UserConversationRow[]).map((row) => row.id);

      const [participantsResult, matchesResult] = await Promise.all([
        conversationIds.length > 0
          ? supabase
              .from(CONVERSATION_PARTICIPANTS_TABLE)
              .select(
                `
                  conversation_id,
                  user_id,
                  is_active,
                  profile:profiles!conversation_participants_user_id_fkey (
                    id,
                    username,
                    display_name,
                    avatar_url
                  )
                `
              )
              .in('conversation_id', conversationIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from(MATCHES_TABLE)
          .select('user_id, target_user_id, match_type, is_mutual')
          .in('match_type', ['like', 'super-like', 'block'])
          .or(`user_id.eq.${user.id},target_user_id.eq.${user.id}`)
      ]);

      if (participantsResult.error) {
        throw participantsResult.error;
      }

      if (matchesResult.error) {
        throw matchesResult.error;
      }

      const matchedUserIds = Array.from(
        new Set(
          ((matchesResult.data ?? []) as ConversationMatchRow[])
            .filter((row) => row.is_mutual && (row.match_type === 'like' || row.match_type === 'super-like'))
            .map((row) => (row.user_id === user.id ? row.target_user_id : row.user_id))
        )
      );
      const matchedProfilesResult =
        matchedUserIds.length > 0
          ? await supabase
              .from(PROFILES_TABLE)
              .select('id, username, display_name, avatar_url')
              .in('id', matchedUserIds)
          : { data: [], error: null };

      if (matchedProfilesResult.error) {
        throw matchedProfilesResult.error;
      }

      if (requestId !== latestRequest || $auth.user?.id !== user.id) {
        return;
      }

      const matchedProfiles = ((matchedProfilesResult.data ?? []) as Array<{
        id: string;
        username: string;
        display_name: string | null;
        avatar_url: string | null;
      }>).map((profile) => ({
        matched_user_id: profile.id,
        profile
      }));

      const visibleConversations = buildConversationListItems(
        user.id,
        (conversationRows ?? []) as UserConversationRow[],
        (participantsResult.data ?? []) as ConversationParticipantRow[],
        (matchesResult.data ?? []) as ConversationMatchRow[],
        matchedProfiles
      );
      const recoveredConversationIds = await recoverDirectConversationIds({
        activeUserId: user.id,
        candidateUserIds: visibleConversations
          .filter((item) => !item.hasConversation)
          .map((item) => item.counterpartUserId),
        supabase: createDirectConversationRecoveryClient(supabase)
      });
      const finalizedConversations = finalizeConversationListItems(visibleConversations, recoveredConversationIds);
      const resolvedConversations = await resolveConversationAvatars(finalizedConversations);

      if (requestId !== latestRequest || $auth.user?.id !== user.id) {
        return;
      }

      conversations = resolvedConversations;
    } catch (error) {
      if (requestId !== latestRequest || $auth.user?.id !== user.id) {
        return;
      }

      console.error('Error loading conversations:', error);
      conversations = [];
      loadError = 'No pudimos cargar tu bandeja ahora mismo. Inténtalo de nuevo.';
    } finally {
      if (requestId === latestRequest) {
        loading = false;
      }
    }
  }

  $: if ($auth.initialized) {
    if ($auth.user?.id && $auth.user.id !== activeUserId) {
      activeUserId = $auth.user.id;
      void loadConversations();
    }

    if (!$auth.user) {
      latestRequest += 1;
      activeUserId = null;
      loading = false;
      loadError = '';
      conversations = [];
    }
  }
</script>

<AppShell active="messages" onSignOut={handleSignOut} {signingOut}>
<div class="min-h-screen bg-gray-50 px-4 py-6 dark:bg-dark-900">
  <div class="mx-auto max-w-5xl space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Mensajes</h1>
        <p class="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
          Esta bandeja solo muestra conversaciones directas con matches mutuos. Los bloqueos y conversaciones fuera de
          match quedan ocultos para mantener la privacidad.
        </p>
      </div>

      <button
        type="button"
        on:click={loadConversations}
        disabled={loading}
        class="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if loading}Actualizando…{:else}Actualizar{/if}
      </button>
    </header>

    {#if loading}
      <section class="rounded-2xl bg-white px-6 py-12 text-center shadow-lg dark:bg-gray-800">
        <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Cargando conversaciones visibles…</p>
      </section>
    {:else if loadError}
      <section class="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        <p>{loadError}</p>
      </section>
    {:else if conversations.length === 0}
      <section class="rounded-2xl bg-white px-6 py-12 text-center shadow-lg dark:bg-gray-800">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Tu bandeja está vacía</h2>
        <p class="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Tus conversaciones directas con matches mutuos aparecerán aquí en cuanto estén listas para abrirse.
        </p>
        <a
          href="/matches"
          class="mt-6 inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
        >
          Ver matches
        </a>
      </section>
    {:else}
      <section class="space-y-4">
        {#each conversations as conversation (conversation.conversationId)}
          <article class="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-center gap-4">
                {#if conversation.counterpartAvatarUrl}
                  <img
                    src={conversation.counterpartAvatarUrl}
                    alt={conversation.counterpartName}
                    class="h-14 w-14 rounded-2xl object-cover shadow-sm"
                  />
                {:else}
                  <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-lg font-bold text-primary-600 dark:bg-primary-900 dark:text-primary-300">
                    {(conversation.counterpartName.trim()[0] || 'U').toUpperCase()}
                  </div>
                {/if}

                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="truncate text-lg font-semibold text-gray-900 dark:text-white">
                      {conversation.counterpartName}
                    </h2>
                    <span class="truncate text-sm text-gray-500 dark:text-gray-400">
                      @{conversation.counterpartUsername}
                    </span>
                    {#if conversation.unreadCount > 0}
                      <span class="inline-flex items-center rounded-full bg-primary-600 px-2.5 py-1 text-xs font-semibold text-white">
                        {conversation.unreadCount} nuevo{conversation.unreadCount === 1 ? '' : 's'}
                      </span>
                    {/if}
                  </div>

                  <p class="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                    {formatMessagePreview(conversation)}
                  </p>
                </div>
              </div>

              <div class="flex shrink-0 flex-col items-start gap-3 sm:items-end">
                <p class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {formatLastActivity(conversation.lastActivityAt)}
                </p>

                <a
                  href={`/messages/${conversation.conversationId}`}
                  class="inline-flex items-center justify-center rounded-xl border border-primary-300 px-4 py-3 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 dark:border-primary-700 dark:text-primary-300 dark:hover:bg-primary-950/30"
                >
                  Abrir chat
                </a>
              </div>
            </div>
          </article>
        {/each}
      </section>
    {/if}
  </div>
</div>
</AppShell>