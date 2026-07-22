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
  import { deleteMessageMedia, resolveMessageMediaUrl, uploadMessageMedia } from '$lib/supabase/message-media';
  import { MESSAGE_MEDIA_MIME_TYPES, validateMessageMediaFile } from '$lib/message-media';
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
  let resolvedMediaUrls: Record<string, string | null> = {};
  let draft = '';
  let sending = false;
  let sendError = '';
  let sendSuccess = '';
  let mediaInput: HTMLInputElement | null = null;
  let selectedMediaFile: File | null = null;
  let selectedMediaPreviewUrl: string | null = null;
  let mediaError = '';
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
    resolvedMediaUrls = {};
    clearSelectedMedia();
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
    void resolvePendingMediaUrls();
  }

  async function resolvePendingMediaUrls() {
    const itemsNeedingResolution = messageItems.filter(
      (item) => item.mediaUrl && !(item.id in resolvedMediaUrls)
    );

    if (itemsNeedingResolution.length === 0) {
      return;
    }

    const resolved = await Promise.allSettled(
      itemsNeedingResolution.map((item) => resolveMessageMediaUrl(item.mediaUrl))
    );

    const nextResolvedMediaUrls = { ...resolvedMediaUrls };

    itemsNeedingResolution.forEach((item, index) => {
      const result = resolved[index];
      nextResolvedMediaUrls[item.id] = result.status === 'fulfilled' ? (result.value ?? null) : null;
    });

    resolvedMediaUrls = nextResolvedMediaUrls;
  }

  function handleMediaFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    mediaError = '';

    if (!file) {
      return;
    }

    const validation = validateMessageMediaFile(file);

    if (!validation.valid) {
      mediaError = validation.error;
      input.value = '';
      return;
    }

    if (selectedMediaPreviewUrl) {
      URL.revokeObjectURL(selectedMediaPreviewUrl);
    }

    selectedMediaFile = file;
    selectedMediaPreviewUrl = URL.createObjectURL(file);
  }

  function clearSelectedMedia() {
    if (selectedMediaPreviewUrl) {
      URL.revokeObjectURL(selectedMediaPreviewUrl);
    }

    selectedMediaFile = null;
    selectedMediaPreviewUrl = null;
    mediaError = '';

    if (mediaInput) {
      mediaInput.value = '';
    }
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
      resolvedMediaUrls = {};
      clearSelectedMedia();
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
    const mediaFile = selectedMediaFile;

    if (
      !userId ||
      !conversationId ||
      !conversation ||
      (!trimmedDraft && !mediaFile) ||
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
    let uploadedMediaRef: string | null = null;

    try {
      if (mediaFile) {
        const uniqueSuffix =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        uploadedMediaRef = await uploadMessageMedia(userId, conversationId, mediaFile, uniqueSuffix);
      }

      const { data, error } = await supabase
        .from(MESSAGES_TABLE)
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: trimmedDraft || null,
          media_url: uploadedMediaRef,
          media_type: uploadedMediaRef ? mediaFile?.type ?? null : null
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
      clearSelectedMedia();
      sendSuccess = 'Mensaje enviado.';
      mergeMessageRow(data as DirectMessageRow);
      syncMessageItems();
      await markConversationRead(conversationId, userId);
      await scrollTimelineToBottom();
    } catch (error) {
      if (uploadedMediaRef) {
        await deleteMessageMedia(uploadedMediaRef).catch(() => {});
      }

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
      resolvedMediaUrls = {};
      clearSelectedMedia();
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

    if (selectedMediaPreviewUrl) {
      URL.revokeObjectURL(selectedMediaPreviewUrl);
    }
  });
</script>

<div class="min-h-screen bg-dark-950 px-4 py-6">
  <div class="mx-auto max-w-4xl space-y-6">
    <header class="flex flex-col gap-4 rounded-3xl p-5 shadow-lg ring-1 sm:flex-row sm:items-center sm:justify-between bg-gray-800 ring-gray-700">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-3 text-sm font-medium">
          <a
            href="/messages"
            class="transition text-primary-400 hover:text-primary-300"
          >
            ← Volver a mensajes
          </a>
          <a
            href="/matches"
            class="transition text-primary-400 hover:text-primary-300"
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
              <div class="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-bold bg-primary-900 text-primary-300">
                {getInitials(conversation.counterpartName)}
              </div>
            {/if}

            <div class="min-w-0">
              <h1 class="truncate text-2xl font-bold text-white">
                {conversation.counterpartName}
              </h1>
              <p class="truncate text-sm text-gray-400">@{conversation.counterpartUsername}</p>
            </div>
          </div>
        {:else}
          <div class="mt-4">
            <h1 class="text-2xl font-bold text-white">Chat directo</h1>
            <p class="mt-2 text-sm text-gray-400">
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
          class="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if loading}Actualizando…{:else}Actualizar{/if}
        </button>

        {#if conversation}
          <button
            type="button"
            on:click={blockConversationCounterpart}
            disabled={blockingConversation}
            class="inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 border-rose-800 text-rose-300 hover:bg-rose-950/30"
          >
            {#if blockingConversation}Bloqueando…{:else}Bloquear a {conversation.counterpartName}{/if}
          </button>
        {/if}
      </div>
    </header>

    {#if loading}
      <section class="rounded-3xl px-6 py-12 text-center shadow-lg bg-gray-800">
        <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
        <p class="mt-4 text-sm text-gray-400">Cargando conversación…</p>
      </section>
    {:else if loadError}
      <section class="rounded-3xl border px-5 py-4 text-sm shadow-sm border-red-900 bg-red-950/30 text-red-300">
        <p>{loadError}</p>
      </section>
    {:else if conversation}
      <section class="space-y-4">
        {#if reportFeedback}
          <div class="rounded-2xl border px-4 py-3 text-sm shadow-sm border-emerald-900 bg-emerald-950/30 text-emerald-300">
            {reportFeedback}
          </div>
        {/if}

        <div
          bind:this={timelineElement}
          class="max-h-[60vh] space-y-3 overflow-y-auto rounded-3xl p-5 shadow-lg ring-1 bg-gray-800 ring-gray-700"
        >
          {#if messageItems.length === 0}
            <div class="rounded-2xl border border-dashed px-5 py-8 text-center border-gray-600">
              <h2 class="text-lg font-semibold text-white">Aún no hay mensajes</h2>
              <p class="mt-2 text-sm text-gray-400">
                Rompe el hielo con tu primer mensaje. Cuando lleguen nuevas respuestas, el chat intentará actualizarlas en
                tiempo real.
              </p>
            </div>
          {:else}
            {#each messageItems as message (message.id)}
              <div class={`flex ${message.isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                <article
                  class={`max-w-[85%] rounded-3xl px-4 py-3 shadow-sm ${message.isOwnMessage ? 'bg-primary-600 text-white' : 'bg-gray-900 text-gray-100'}`}
                >
                  <div class="flex items-start justify-between gap-3">
                    <p class={`text-xs font-semibold uppercase tracking-wide ${message.isOwnMessage ? 'text-primary-100' : 'text-gray-400'}`}>
                      {message.isOwnMessage ? 'Tú' : conversation.counterpartName}
                    </p>

                    <button
                      type="button"
                      on:click={() => openMessageReport(message)}
                      disabled={message.isOwnMessage}
                      aria-label={message.isOwnMessage ? 'No puedes reportarte a ti misma/o.' : 'Reportar este mensaje'}
                      title={message.isOwnMessage ? 'No puedes reportarte a ti misma/o.' : 'Reportar este mensaje'}
                      class={`shrink-0 text-xs font-semibold transition ${message.isOwnMessage ? 'cursor-not-allowed text-primary-200/70 opacity-70' : 'text-rose-300 hover:text-rose-200'}`}
                    >
                      Reportar
                    </button>
                  </div>
                  {#if message.mediaUrl && resolvedMediaUrls[message.id]}
                    <img
                      src={resolvedMediaUrls[message.id]}
                      alt="Imagen enviada en el chat"
                      class="mt-2 max-h-72 w-full rounded-2xl object-cover"
                      loading="lazy"
                    />
                  {:else if message.mediaUrl}
                    <div class="mt-2 flex h-24 w-full items-center justify-center rounded-2xl bg-black/10 text-xs">
                      Cargando imagen…
                    </div>
                  {/if}
                  {#if message.content}
                    <p class={`mt-2 whitespace-pre-wrap text-sm leading-6 ${message.isDeleted ? 'italic opacity-80' : ''}`}>
                      {message.content}
                    </p>
                  {:else if !message.mediaUrl}
                    <p class="mt-2 whitespace-pre-wrap text-sm leading-6 italic opacity-80">Mensaje vacío</p>
                  {/if}
                  <p class={`mt-3 text-[11px] ${message.isOwnMessage ? 'text-primary-100' : 'text-gray-400'}`}>
                    {formatTimestamp(message.createdAt)}
                  </p>
                </article>
              </div>
            {/each}
          {/if}
        </div>

        <form
          class="rounded-3xl p-5 shadow-lg ring-1 bg-gray-800 ring-gray-700"
          on:submit|preventDefault={sendMessage}
        >
          <label for="message-draft" class="text-sm font-semibold text-white">Escribe un mensaje</label>
          <textarea
            id="message-draft"
            bind:value={draft}
            rows="4"
            maxlength="2000"
            placeholder="Escribe algo bonito…"
            class="mt-3 w-full rounded-2xl border px-4 py-3 text-sm shadow-sm outline-none transition focus:ring-2 border-gray-600 bg-gray-900 text-white focus:border-primary-400 focus:ring-primary-900"
          ></textarea>

          <input
            bind:this={mediaInput}
            type="file"
            accept={MESSAGE_MEDIA_MIME_TYPES.join(',')}
            class="hidden"
            disabled={sending}
            on:change={handleMediaFileChange}
          />

          {#if selectedMediaPreviewUrl}
            <div class="mt-3 flex items-center gap-3 rounded-2xl border border-dashed p-3 border-gray-600">
              <img src={selectedMediaPreviewUrl} alt="Vista previa" class="h-16 w-16 rounded-xl object-cover" />
              <div class="flex-1 text-xs text-gray-400">{selectedMediaFile?.name}</div>
              <button
                type="button"
                on:click={clearSelectedMedia}
                disabled={sending}
                class="rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 border-red-900/60 text-red-300 hover:bg-red-950/30"
              >
                Quitar
              </button>
            </div>
          {/if}

          {#if mediaError}
            <p class="mt-2 text-xs text-red-300">{mediaError}</p>
          {/if}

          <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-3">
              <button
                type="button"
                on:click={() => mediaInput?.click()}
                disabled={sending}
                class="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 border-gray-600 text-gray-200 hover:bg-gray-800"
              >
                📷 Imagen
              </button>

              <div class="space-y-1 text-sm" aria-live="polite">
                {#if sendError}
                  <p class="text-red-300">{sendError}</p>
                {:else if sendSuccess}
                  <p class="text-emerald-300">{sendSuccess}</p>
                {/if}
              </div>
            </div>

            <button
              type="submit"
              disabled={sending || (draft.trim().length === 0 && !selectedMediaFile)}
              class="inline-flex items-center justify-center rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
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
