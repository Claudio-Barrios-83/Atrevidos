<script lang="ts">
  import type { RealtimeChannel } from '@supabase/supabase-js';
  import { page } from '$app/stores';
  import ReportModal from '$lib/components/report-modal.svelte';
  import { saveDiscoverMatch } from '$lib/discover-actions';
  import {
    buildDirectConversationView,
    buildDirectMessageItems,
    createBlockedDirectConversationRevocation,
    shouldIgnoreBlockedDirectConversationUpdate,
    type BlockedDirectConversationRevocation,
    type DirectConversationMatchRow,
    type DirectConversationParticipantRow,
    type DirectConversationRow,
    type DirectConversationView,
    type DirectMessageItem,
    type DirectMessageRow
  } from '$lib/messages';
  import type { ReportTarget } from '$lib/reports';
  import { auth } from '$lib';
  import { supabase } from '$lib/supabase/client';
  import { resolveStorageImageUrl } from '$lib/supabase/profile-media';
  import { onDestroy, tick } from 'svelte';

  const USER_CONVERSATIONS_VIEW = 'user_conversations' as never;
  const CONVERSATION_PARTICIPANTS_TABLE = 'conversation_participants' as never;
  const MESSAGES_TABLE = 'messages' as never;
  const MATCHES_TABLE = 'matches' as never;
  const POLL_INTERVAL_MS = 20000;

  type ConversationViewRow = DirectConversationRow & {
    name: string | null;
    avatar_url: string | null;
    last_message_at: string | null;
  };

  type ConversationPageView = DirectConversationView & {
    counterpartAvatarUrl: string | null;
  };

  let activeUserId: string | null = null;
  let activeConversationId: string | null = null;
  let latestRequest = 0;
  let loading = false;
  let loadError = '';
  let conversation: ConversationPageView | null = null;
  let messageRows: DirectMessageRow[] = [];
  let messageItems: DirectMessageItem[] = [];
  let draft = '';
  let sending = false;
  let sendError = '';
  let sendSuccess = '';
  let reportFeedback = '';
  let blockingConversation = false;
  let blockedConversationRevocation: BlockedDirectConversationRevocation | null = null;
  let reportModalOpen = false;
  let reportTarget: ReportTarget | null = null;
  let timelineElement: HTMLDivElement | null = null;
  let realtimeChannel: RealtimeChannel | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function formatTimestamp(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Fecha desconocida';
    }

    return new Intl.DateTimeFormat('es', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  function getInitials(name: string) {
    return (name.trim()[0] || 'U').toUpperCase();
  }

  function applyBlockedConversationRevocation(revocation: BlockedDirectConversationRevocation) {
    blockedConversationRevocation = revocation;
    latestRequest += 1;
    clearLiveUpdates();
    loading = false;
    conversation = null;
    messageRows = [];
    syncMessageItems();
    draft = '';
    sendError = '';
    sendSuccess = '';
    reportModalOpen = false;
    reportTarget = null;
    loadError = revocation.message;
  }

  function mergeMessageRow(nextMessage: DirectMessageRow) {
    const existingIndex = messageRows.findIndex((message) => message.id === nextMessage.id);

    if (existingIndex === -1) {
      messageRows = [...messageRows, nextMessage];
      return;
    }

    messageRows = messageRows.map((message, index) => (index === existingIndex ? nextMessage : message));
  }

  function syncMessageItems() {
    messageItems = activeUserId ? buildDirectMessageItems(activeUserId, messageRows) : [];
  }

  async function scrollTimelineToBottom() {
    await tick();
    timelineElement?.scrollTo({ top: timelineElement.scrollHeight, behavior: 'smooth' });
  }

  async function markConversationRead(conversationId: string, userId: string) {
    const { error } = await supabase
      .from(CONVERSATION_PARTICIPANTS_TABLE)
      .update({ last_read_at: new Date().toISOString() } as never)
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }
  }

  async function loadMessageRows(conversationId: string) {
    const { data, error } = await supabase
      .from(MESSAGES_TABLE)
      .select('id, conversation_id, sender_id, content, media_url, media_type, is_deleted, created_at, updated_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    if (shouldIgnoreBlockedDirectConversationUpdate(blockedConversationRevocation, conversationId, conversation?.counterpartUserId)) {
      return;
    }

    messageRows = (data ?? []) as DirectMessageRow[];
    syncMessageItems();
  }

  async function refreshMessageRows() {
    const userId = activeUserId;
    const conversationId = activeConversationId;

    if (!userId || !conversationId || !conversation) {
      return;
    }

    if (shouldIgnoreBlockedDirectConversationUpdate(blockedConversationRevocation, conversationId, conversation.counterpartUserId)) {
      return;
    }

    try {
      await loadMessageRows(conversationId);

      if (shouldIgnoreBlockedDirectConversationUpdate(blockedConversationRevocation, conversationId, conversation.counterpartUserId)) {
        return;
      }

      await markConversationRead(conversationId, userId);
    } catch (error) {
      console.error('Error refreshing messages:', error);
    }
  }

  function clearLiveUpdates() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (realtimeChannel) {
      void supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  function startLiveUpdates(conversationId: string, userId: string) {
    clearLiveUpdates();

    realtimeChannel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const nextMessage = payload.new as DirectMessageRow;

          if (!nextMessage?.id) {
            return;
          }

          if (shouldIgnoreBlockedDirectConversationUpdate(blockedConversationRevocation, nextMessage.conversation_id)) {
            return;
          }

          mergeMessageRow(nextMessage);
          syncMessageItems();
          void scrollTimelineToBottom();

          if (nextMessage.sender_id !== userId) {
            void markConversationRead(conversationId, userId).catch((error) => {
              console.error('Error marking conversation as read from realtime event:', error);
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void refreshMessageRows();
        }
      });

    pollTimer = setInterval(() => {
      void refreshMessageRows();
    }, POLL_INTERVAL_MS);
  }

  async function loadConversation() {
    const user = $auth.user;
    const conversationId = $page.params.id;

    if (!user || !conversationId) {
      blockedConversationRevocation = null;
      clearLiveUpdates();
      conversation = null;
      messageRows = [];
      syncMessageItems();
      loading = false;
      loadError = '';
      return;
    }

    const requestId = ++latestRequest;
    loading = true;
    loadError = '';
    sendError = '';

    try {
      const { data: conversationRow, error: conversationError } = await supabase
        .from(USER_CONVERSATIONS_VIEW)
        .select('id, is_group, created_at, name, avatar_url, last_message_at')
        .eq('id', conversationId)
        .eq('is_group', false)
        .maybeSingle();

      if (conversationError) {
        throw conversationError;
      }

      if (!conversationRow) {
        throw new Error('Conversation not found');
      }

      const [participantsResult, matchesResult] = await Promise.all([
        supabase
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
          .eq('conversation_id', conversationId),
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

      const resolvedConversation = buildDirectConversationView(
        user.id,
        conversationRow as ConversationViewRow,
        (participantsResult.data ?? []) as DirectConversationParticipantRow[],
        (matchesResult.data ?? []) as DirectConversationMatchRow[]
      );

      if (!resolvedConversation) {
        throw new Error('Conversation is not accessible');
      }

      if (
        shouldIgnoreBlockedDirectConversationUpdate(
          blockedConversationRevocation,
          conversationId,
          resolvedConversation.counterpartUserId
        )
      ) {
        return;
      }

      const resolvedAvatarUrl = await resolveStorageImageUrl(resolvedConversation.counterpartAvatarUrl);

      if (requestId !== latestRequest || $auth.user?.id !== user.id || $page.params.id !== conversationId) {
        return;
      }

      conversation = {
        ...resolvedConversation,
        counterpartAvatarUrl: resolvedAvatarUrl ?? null
      };

      await loadMessageRows(conversationId);
      await markConversationRead(conversationId, user.id);

      if (requestId !== latestRequest || $auth.user?.id !== user.id || $page.params.id !== conversationId) {
        return;
      }

      if (
        shouldIgnoreBlockedDirectConversationUpdate(
          blockedConversationRevocation,
          conversationId,
          resolvedConversation.counterpartUserId
        )
      ) {
        return;
      }

      startLiveUpdates(conversationId, user.id);
      await scrollTimelineToBottom();
    } catch (error) {
      if (requestId !== latestRequest) {
        return;
      }

      console.error('Error loading direct conversation:', error);
      clearLiveUpdates();
      conversation = null;
      messageRows = [];
      syncMessageItems();
      loadError = 'No encontramos esta conversación o no tienes acceso a ella ahora mismo.';
    } finally {
      if (requestId === latestRequest) {
        loading = false;
      }
    }
  }

  async function sendMessage() {
    const userId = activeUserId;
    const conversationId = activeConversationId;
    const trimmedDraft = draft.trim();

    if (
      !userId ||
      !conversationId ||
      !conversation ||
      !trimmedDraft ||
      sending ||
      shouldIgnoreBlockedDirectConversationUpdate(
        blockedConversationRevocation,
        conversationId,
        conversation.counterpartUserId
      )
    ) {
      return;
    }

    sending = true;
    sendError = '';
    sendSuccess = '';

    try {
      const { data, error } = await supabase
        .from(MESSAGES_TABLE)
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: trimmedDraft
        } as never)
        .select('id, conversation_id, sender_id, content, media_url, media_type, is_deleted, created_at, updated_at')
        .single();

      if (error) {
        throw error;
      }

      if (
        shouldIgnoreBlockedDirectConversationUpdate(
          blockedConversationRevocation,
          conversationId,
          conversation.counterpartUserId
        )
      ) {
        return;
      }

      draft = '';
      sendSuccess = 'Mensaje enviado.';
      mergeMessageRow(data as DirectMessageRow);
      syncMessageItems();
      await markConversationRead(conversationId, userId);
      await scrollTimelineToBottom();
    } catch (error) {
      console.error('Error sending message:', error);
      sendError = 'No pudimos enviar tu mensaje. Inténtalo otra vez.';
    } finally {
      sending = false;
    }
  }

  async function blockConversationCounterpart() {
    const user = $auth.user;

    if (!user || !conversation || blockingConversation) {
      return;
    }

    loadError = '';
    reportFeedback = '';
    blockingConversation = true;

    try {
      await saveDiscoverMatch(user.id, conversation.counterpartUserId, 'block');
      const revocation = createBlockedDirectConversationRevocation(
        conversation.conversationId,
        conversation.counterpartUserId,
        conversation.counterpartName
      );
      applyBlockedConversationRevocation(revocation);
    } catch (error) {
      console.error('Error blocking conversation counterpart:', error);
      sendError = 'No pudimos bloquear este perfil. Inténtalo de nuevo.';
    } finally {
      blockingConversation = false;
    }
  }

  function openMessageReport(message: DirectMessageItem) {
    if (!conversation || message.isOwnMessage) {
      return;
    }

    reportTarget = {
      type: 'message',
      id: message.id,
      ownerId: message.senderId,
      label: `el mensaje de ${conversation.counterpartName}`
    };
    reportModalOpen = true;
    reportFeedback = '';
  }

  function closeReportModal() {
    reportModalOpen = false;
    reportTarget = null;
  }

  function handleReportSubmitted(event: CustomEvent<{ message: string; target: ReportTarget }>) {
    reportFeedback = event.detail.message;
    closeReportModal();
  }

  $: if ($auth.initialized) {
    if ($auth.user?.id && ($auth.user.id !== activeUserId || $page.params.id !== activeConversationId)) {
      activeUserId = $auth.user.id;
      activeConversationId = $page.params.id || null;
      void loadConversation();
    }

    if (!$auth.user) {
      latestRequest += 1;
      clearLiveUpdates();
      activeUserId = null;
      activeConversationId = null;
      loading = false;
      loadError = '';
      conversation = null;
      messageRows = [];
      syncMessageItems();
      reportFeedback = '';
      blockingConversation = false;
      blockedConversationRevocation = null;
      reportModalOpen = false;
      reportTarget = null;
    }
  }

  onDestroy(() => {
    clearLiveUpdates();
  });
</script>

<div class="min-h-screen bg-gray-50 px-4 py-6 dark:bg-gray-900">
  <div class="mx-auto max-w-4xl space-y-6">
    <header class="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-3 text-sm font-medium">
          <a
            href="/messages"
            class="text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            ← Volver a mensajes
          </a>
          <a
            href="/matches"
            class="text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            Matches
          </a>
        </div>

        {#if conversation}
          <div class="mt-4 flex min-w-0 items-center gap-4">
            {#if conversation.counterpartAvatarUrl}
              <img
                src={conversation.counterpartAvatarUrl}
                alt={conversation.counterpartName}
                class="h-16 w-16 rounded-2xl object-cover shadow-sm"
              />
            {:else}
              <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-xl font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                {getInitials(conversation.counterpartName)}
              </div>
            {/if}

            <div class="min-w-0">
              <h1 class="truncate text-2xl font-bold text-gray-900 dark:text-white">
                {conversation.counterpartName}
              </h1>
              <p class="truncate text-sm text-gray-500 dark:text-gray-400">@{conversation.counterpartUsername}</p>
            </div>
          </div>
        {:else}
          <div class="mt-4">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Chat directo</h1>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Carga una conversación directa existente para ver el historial y enviar mensajes.
            </p>
          </div>
        {/if}
      </div>

      <div class="flex flex-col gap-3 sm:items-end">
        <button
          type="button"
          on:click={loadConversation}
          disabled={loading}
          class="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if loading}Actualizando…{:else}Actualizar{/if}
        </button>

        {#if conversation}
          <button
            type="button"
            on:click={blockConversationCounterpart}
            disabled={blockingConversation}
            class="inline-flex items-center justify-center rounded-xl border border-rose-300 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
          >
            {#if blockingConversation}Bloqueando…{:else}Bloquear a {conversation.counterpartName}{/if}
          </button>
        {/if}
      </div>
    </header>

    {#if loading}
      <section class="rounded-3xl bg-white px-6 py-12 text-center shadow-lg dark:bg-gray-800">
        <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Cargando conversación…</p>
      </section>
    {:else if loadError}
      <section class="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        <p>{loadError}</p>
      </section>
    {:else if conversation}
      <section class="space-y-4">
        {#if reportFeedback}
          <div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            {reportFeedback}
          </div>
        {/if}

        <div
          bind:this={timelineElement}
          class="max-h-[60vh] space-y-3 overflow-y-auto rounded-3xl bg-white p-5 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
        >
          {#if messageItems.length === 0}
            <div class="rounded-2xl border border-dashed border-gray-300 px-5 py-8 text-center dark:border-gray-600">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Aún no hay mensajes</h2>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Rompe el hielo con tu primer mensaje. Cuando lleguen nuevas respuestas, el chat intentará actualizarlas en
                tiempo real.
              </p>
            </div>
          {:else}
            {#each messageItems as message (message.id)}
              <div class={`flex ${message.isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                <article
                  class={`max-w-[85%] rounded-3xl px-4 py-3 shadow-sm ${message.isOwnMessage ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100'}`}
                >
                  <div class="flex items-start justify-between gap-3">
                    <p class={`text-xs font-semibold uppercase tracking-wide ${message.isOwnMessage ? 'text-indigo-100' : 'text-gray-500 dark:text-gray-400'}`}>
                      {message.isOwnMessage ? 'Tú' : conversation.counterpartName}
                    </p>

                    <button
                      type="button"
                      on:click={() => openMessageReport(message)}
                      disabled={message.isOwnMessage}
                      aria-label={message.isOwnMessage ? 'No puedes reportarte a ti misma/o.' : 'Reportar este mensaje'}
                      title={message.isOwnMessage ? 'No puedes reportarte a ti misma/o.' : 'Reportar este mensaje'}
                      class={`shrink-0 text-xs font-semibold transition ${message.isOwnMessage ? 'cursor-not-allowed text-indigo-200/70 opacity-70' : 'text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200'}`}
                    >
                      Reportar
                    </button>
                  </div>
                  <p class={`mt-2 whitespace-pre-wrap text-sm leading-6 ${message.isDeleted ? 'italic opacity-80' : ''}`}>
                    {message.content || 'Mensaje vacío'}
                  </p>
                  <p class={`mt-3 text-[11px] ${message.isOwnMessage ? 'text-indigo-100' : 'text-gray-500 dark:text-gray-400'}`}>
                    {formatTimestamp(message.createdAt)}
                  </p>
                </article>
              </div>
            {/each}
          {/if}
        </div>

        <form
          class="rounded-3xl bg-white p-5 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
          on:submit|preventDefault={sendMessage}
        >
          <label for="message-draft" class="text-sm font-semibold text-gray-900 dark:text-white">Escribe un mensaje</label>
          <textarea
            id="message-draft"
            bind:value={draft}
            rows="4"
            maxlength="2000"
            placeholder="Escribe algo bonito…"
            class="mt-3 w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-900"
          ></textarea>

          <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="space-y-1 text-sm" aria-live="polite">
              {#if sendError}
                <p class="text-red-600 dark:text-red-300">{sendError}</p>
              {:else if sendSuccess}
                <p class="text-emerald-600 dark:text-emerald-300">{sendSuccess}</p>
              {:else}
                <p class="text-gray-500 dark:text-gray-400">Solo texto por ahora. El soporte multimedia llegará después.</p>
              {/if}
            </div>

            <button
              type="submit"
              disabled={sending || draft.trim().length === 0}
              class="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {#if sending}Enviando…{:else}Enviar{/if}
            </button>
          </div>
        </form>
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
