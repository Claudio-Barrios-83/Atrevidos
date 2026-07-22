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
  import type { MutualMatchRow } from '$lib/matches';
  import { buildMatchListItems, type MatchListItem } from '$lib/matches';

  const USER_CONVERSATIONS_VIEW = 'user_conversations' as never;
  const CONVERSATION_PARTICIPANTS_TABLE = 'conversation_participants' as never;
  const MATCHES_TABLE = 'matches' as never;
  const PROFILES_TABLE = 'profiles' as never;

  type GroupListItem = {
    id: string;
    name: string;
    avatarUrl: string | null;
    lastMessagePreview: string | null;
    lastActivityAt: string | null;
    unreadCount: number;
  };

  let activeUserId: string | null = null;
  let latestRequest = 0;
  let loading = false;
  let loadError = '';
  let conversations: ConversationListItem[] = [];
  let groups: GroupListItem[] = [];
  let signingOut = false;

  let showCreateGroupForm = false;
  let creatingGroup = false;
  let createGroupError = '';
  let groupNameDraft = '';
  let mutualMatchOptions: MatchListItem[] = [];
  let selectedGroupMemberIds = new Set<string>();

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

  async function loadGroups() {
    const user = $auth.user;

    if (!user) {
      groups = [];
      return;
    }

    try {
      const { data, error } = await supabase
        .from(USER_CONVERSATIONS_VIEW)
        .select('id, name, avatar_url, last_message_at, last_message_content, last_message_time, unread_count, last_message_media_url')
        .eq('is_group', true)
        .order('last_message_time', { ascending: false, nullsFirst: false })
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) {
        throw error;
      }

      type GroupRow = {
        id: string;
        name: string | null;
        avatar_url: string | null;
        last_message_at: string | null;
        last_message_content: string | null;
        last_message_time: string | null;
        unread_count: number | null;
        last_message_media_url: string | null;
      };

      const rows = (data ?? []) as GroupRow[];
      const resolvedAvatars = await Promise.allSettled(rows.map((row) => resolveStorageImageUrl(row.avatar_url)));

      groups = rows.map((row, index) => ({
        id: row.id,
        name: row.name || 'Grupo sin nombre',
        avatarUrl: resolvedAvatars[index]?.status === 'fulfilled' ? (resolvedAvatars[index].value ?? null) : null,
        lastMessagePreview: row.last_message_content || (row.last_message_media_url ? '📷 Foto' : null),
        lastActivityAt: row.last_message_time || row.last_message_at,
        unreadCount: Math.max(0, row.unread_count ?? 0)
      }));
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  }

  async function loadMutualMatchOptions(userId: string) {
    try {
      const [{ data: matchRows, error: matchesError }, { data: blockedRows, error: blockedError }] = await Promise.all([
        supabase
          .from(MATCHES_TABLE)
          .select(
            `
              id,
              target_user_id,
              match_type,
              created_at,
              target_profile:profiles!matches_target_user_id_fkey ( id, username, display_name, avatar_url, location, interests, relationship_intent )
            `
          )
          .eq('user_id', userId)
          .eq('is_mutual', true),
        supabase.from(MATCHES_TABLE).select('user_id, target_user_id, match_type').eq('match_type', 'block').or(`user_id.eq.${userId},target_user_id.eq.${userId}`)
      ]);

      if (matchesError) throw matchesError;
      if (blockedError) throw blockedError;

      const blockedUserIds = new Set<string>();
      for (const row of (blockedRows ?? []) as Array<{ user_id: string; target_user_id: string }>) {
        blockedUserIds.add(row.user_id === userId ? row.target_user_id : row.user_id);
      }

      mutualMatchOptions = buildMatchListItems((matchRows ?? []) as MutualMatchRow[], blockedUserIds);
    } catch (error) {
      console.error('Error loading mutual matches for group creation:', error);
      mutualMatchOptions = [];
    }
  }

  function toggleGroupMemberSelection(userId: string) {
    const next = new Set(selectedGroupMemberIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    selectedGroupMemberIds = next;
  }

  async function openCreateGroupForm() {
    showCreateGroupForm = true;
    createGroupError = '';
    groupNameDraft = '';
    selectedGroupMemberIds = new Set();

    if ($auth.user?.id) {
      await loadMutualMatchOptions($auth.user.id);
    }
  }

  function closeCreateGroupForm() {
    showCreateGroupForm = false;
    createGroupError = '';
  }

  async function createGroup() {
    const user = $auth.user;
    const trimmedName = groupNameDraft.trim();

    if (!user || creatingGroup) return;

    if (!trimmedName) {
      createGroupError = 'Elegí un nombre para el grupo.';
      return;
    }

    if (selectedGroupMemberIds.size < 2) {
      createGroupError = 'Seleccioná al menos 2 matches para armar el grupo.';
      return;
    }

    creatingGroup = true;
    createGroupError = '';

    try {
      // Se crea vía RPC (SECURITY DEFINER) en vez de insertar directo: la
      // política RLS de "conversations" exige ya ser participante activo del
      // grupo para poder leer la fila insertada (RETURNING), pero ese
      // participante todavía no existe en ese punto. La función atómica
      // evita ese problema de orden y valida server-side que los miembros
      // sean matches mutuos.
      const { data: conversationId, error: rpcError } = await supabase.rpc('create_group_conversation' as never, {
        creator_id: user.id,
        group_name: trimmedName,
        member_ids: Array.from(selectedGroupMemberIds)
      } as never);

      if (rpcError) throw rpcError;
      if (!conversationId) throw new Error('No se pudo crear el grupo.');

      showCreateGroupForm = false;
      window.location.href = `/messages/group/${conversationId}`;
    } catch (error) {
      console.error('Error creating group:', error);
      createGroupError = 'No pudimos crear el grupo. Inténtalo de nuevo.';
    } finally {
      creatingGroup = false;
    }
  }

  $: if ($auth.initialized) {
    if ($auth.user?.id && $auth.user.id !== activeUserId) {
      activeUserId = $auth.user.id;
      void loadConversations();
      void loadGroups();
    }

    if (!$auth.user) {
      latestRequest += 1;
      activeUserId = null;
      loading = false;
      loadError = '';
      conversations = [];
      groups = [];
      showCreateGroupForm = false;
      mutualMatchOptions = [];
      selectedGroupMemberIds = new Set();
    }
  }
</script>

<AppShell active="messages" onSignOut={handleSignOut} {signingOut}>
<div class="px-4 py-6">
  <div class="mx-auto max-w-5xl space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-3xl font-bold text-white">Mensajes</h1>
        <p class="mt-2 max-w-3xl text-sm text-gray-400">
          Esta bandeja solo muestra conversaciones directas con matches mutuos. Los bloqueos y conversaciones fuera de
          match quedan ocultos para mantener la privacidad.
        </p>
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          on:click={openCreateGroupForm}
          class="inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition border-primary-800 text-primary-300 hover:bg-primary-950/30"
        >
          + Nuevo grupo
        </button>
        <button
        type="button"
        on:click={loadConversations}
        disabled={loading}
        class="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if loading}Actualizando…{:else}Actualizar{/if}
      </button>
      </div>
    </header>

    {#if showCreateGroupForm}
      <section class="rounded-2xl p-5 shadow-lg ring-1 bg-gray-800 ring-primary-900">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-white">Crear grupo</h2>
          <button type="button" on:click={closeCreateGroupForm} class="text-sm text-gray-400 hover:text-white">
            Cerrar
          </button>
        </div>

        <label class="mt-4 block text-sm font-medium text-white" for="group-name">Nombre del grupo</label>
        <input
          id="group-name"
          type="text"
          bind:value={groupNameDraft}
          maxlength="80"
          placeholder="Ej. Amigos de la playa"
          class="mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 border-gray-600 bg-gray-900 text-white"
        />

        <p class="mt-4 text-sm font-medium text-white">
          Elegí al menos 2 matches mutuos ({selectedGroupMemberIds.size} seleccionados)
        </p>

        {#if mutualMatchOptions.length === 0}
          <p class="mt-2 text-sm text-gray-400">
            Todavía no tenés matches mutuos para armar un grupo. Conseguí algunos en Descubrir.
          </p>
        {:else}
          <div class="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {#each mutualMatchOptions as match (match.matchedUserId)}
              <label class="flex items-center gap-3 rounded-xl border p-3 border-gray-700">
                <input
                  type="checkbox"
                  checked={selectedGroupMemberIds.has(match.matchedUserId)}
                  on:change={() => toggleGroupMemberSelection(match.matchedUserId)}
                  class="h-4 w-4 rounded border-gray-600 bg-dark-900 text-primary-600 focus:ring-primary-500"
                />
                <span class="text-sm font-medium text-white">{match.displayName}</span>
                <span class="text-xs text-gray-400">@{match.username}</span>
              </label>
            {/each}
          </div>
        {/if}

        {#if createGroupError}
          <p class="mt-3 text-sm text-red-300">{createGroupError}</p>
        {/if}

        <button
          type="button"
          on:click={createGroup}
          disabled={creatingGroup}
          class="mt-4 inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if creatingGroup}Creando…{:else}Crear grupo{/if}
        </button>
      </section>
    {/if}

    {#if groups.length > 0}
      <section class="space-y-3">
        <h2 class="text-lg font-semibold text-white">Grupos</h2>
        {#each groups as group (group.id)}
          <a
            href={`/messages/group/${group.id}`}
            class="flex items-center gap-4 rounded-2xl p-4 shadow-lg ring-1 transition hover:ring-primary-300 bg-gray-800 ring-gray-700"
          >
            {#if group.avatarUrl}
              <img src={group.avatarUrl} alt={group.name} class="h-12 w-12 rounded-2xl object-cover" />
            {:else}
              <div class="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-bold bg-fuchsia-950/40 text-fuchsia-300">
                👥
              </div>
            {/if}
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h3 class="truncate text-sm font-semibold text-white">{group.name}</h3>
                {#if group.unreadCount > 0}
                  <span class="inline-flex items-center rounded-full bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {group.unreadCount}
                  </span>
                {/if}
              </div>
              <p class="truncate text-xs text-gray-400">
                {group.lastMessagePreview || 'Aún no hay mensajes en este grupo.'}
              </p>
            </div>
          </a>
        {/each}
      </section>
    {/if}

    {#if loading}
      <section class="rounded-2xl px-6 py-12 text-center shadow-lg bg-gray-800">
        <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
        <p class="mt-4 text-sm text-gray-400">Cargando conversaciones visibles…</p>
      </section>
    {:else if loadError}
      <section class="rounded-2xl border px-5 py-4 text-sm shadow-sm border-red-900 bg-red-950/30 text-red-300">
        <p>{loadError}</p>
      </section>
    {:else if conversations.length === 0}
      <section class="rounded-2xl px-6 py-12 text-center shadow-lg bg-gray-800">
        <h2 class="text-xl font-semibold text-white">Tu bandeja está vacía</h2>
        <p class="mt-3 text-sm text-gray-400">
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
          <article class="rounded-2xl p-5 shadow-lg ring-1 bg-gray-800 ring-gray-700">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex min-w-0 items-center gap-4">
                {#if conversation.counterpartAvatarUrl}
                  <img
                    src={conversation.counterpartAvatarUrl}
                    alt={conversation.counterpartName}
                    class="h-14 w-14 rounded-2xl object-cover shadow-sm"
                  />
                {:else}
                  <div class="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold bg-primary-900 text-primary-300">
                    {(conversation.counterpartName.trim()[0] || 'U').toUpperCase()}
                  </div>
                {/if}

                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="truncate text-lg font-semibold text-white">
                      {conversation.counterpartName}
                    </h2>
                    <span class="truncate text-sm text-gray-400">
                      @{conversation.counterpartUsername}
                    </span>
                    {#if conversation.unreadCount > 0}
                      <span class="inline-flex items-center rounded-full bg-primary-600 px-2.5 py-1 text-xs font-semibold text-white">
                        {conversation.unreadCount} nuevo{conversation.unreadCount === 1 ? '' : 's'}
                      </span>
                    {/if}
                  </div>

                  <p class="mt-2 line-clamp-2 text-sm text-gray-300">
                    {formatMessagePreview(conversation)}
                  </p>
                </div>
              </div>

              <div class="flex shrink-0 flex-col items-start gap-3 sm:items-end">
                <p class="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {formatLastActivity(conversation.lastActivityAt)}
                </p>

                <a
                  href={`/messages/${conversation.conversationId}`}
                  class="inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition border-primary-700 text-primary-300 hover:bg-primary-950/30"
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