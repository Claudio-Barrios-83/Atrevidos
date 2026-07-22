<script lang="ts">
  import type { RealtimeChannel } from '@supabase/supabase-js';
  import { page } from '$app/stores';
  import { auth } from '$lib';
  import { supabase } from '$lib/supabase/client';
  import { resolveStorageImageUrl } from '$lib/supabase/profile-media';
  import { deleteMessageMedia, resolveMessageMediaUrl, uploadMessageMedia } from '$lib/supabase/message-media';
  import { MESSAGE_MEDIA_MIME_TYPES, validateMessageMediaFile } from '$lib/message-media';
  import {
    buildGroupConversationView,
    buildGroupMessageItems,
    type GroupConversationRow,
    type GroupConversationView,
    type GroupMessageItem,
    type GroupMessageRow,
    type GroupParticipantRow
  } from '$lib/groups';
  import ReportModal from '$lib/components/report-modal.svelte';
  import type { ReportTarget } from '$lib/reports';
  import { onDestroy, tick } from 'svelte';

  const CONVERSATIONS_TABLE = 'conversations' as never;
  const CONVERSATION_PARTICIPANTS_TABLE = 'conversation_participants' as never;
  const MESSAGES_TABLE = 'messages' as never;
  const POLL_INTERVAL_MS = 20000;

  let activeUserId: string | null = null;
  let activeConversationId: string | null = null;
  let latestRequest = 0;
  let loading = false;
  let loadError = '';
  let conversation: GroupConversationView | null = null;
  let messageRows: GroupMessageRow[] = [];
  let messageItems: GroupMessageItem[] = [];
  let resolvedMediaUrls: Record<string, string | null> = {};
  let draft = '';
  let sending = false;
  let sendError = '';
  let sendSuccess = '';
  let mediaInput: HTMLInputElement | null = null;
  let selectedMediaFile: File | null = null;
  let selectedMediaPreviewUrl: string | null = null;
  let mediaError = '';
  let reportModalOpen = false;
  let reportTarget: ReportTarget | null = null;
  let reportFeedback = '';
  let timelineElement: HTMLDivElement | null = null;
  let realtimeChannel: RealtimeChannel | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function formatTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Fecha desconocida';
    return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function getInitials(name: string) {
    return (name.trim()[0] || 'G').toUpperCase();
  }

  function syncMessageItems() {
    messageItems = activeUserId && conversation ? buildGroupMessageItems(activeUserId, messageRows, conversation.participants) : [];
    void resolvePendingMediaUrls();
  }

  async function resolvePendingMediaUrls() {
    const itemsNeedingResolution = messageItems.filter((item) => item.mediaUrl && !(item.id in resolvedMediaUrls));

    if (itemsNeedingResolution.length === 0) return;

    const resolved = await Promise.allSettled(itemsNeedingResolution.map((item) => resolveMessageMediaUrl(item.mediaUrl)));
    const next = { ...resolvedMediaUrls };

    itemsNeedingResolution.forEach((item, index) => {
      const result = resolved[index];
      next[item.id] = result.status === 'fulfilled' ? (result.value ?? null) : null;
    });

    resolvedMediaUrls = next;
  }

  function handleMediaFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    mediaError = '';

    if (!file) return;

    const validation = validateMessageMediaFile(file);

    if (!validation.valid) {
      mediaError = validation.error;
      input.value = '';
      return;
    }

    if (selectedMediaPreviewUrl) URL.revokeObjectURL(selectedMediaPreviewUrl);

    selectedMediaFile = file;
    selectedMediaPreviewUrl = URL.createObjectURL(file);
  }

  function clearSelectedMedia() {
    if (selectedMediaPreviewUrl) URL.revokeObjectURL(selectedMediaPreviewUrl);
    selectedMediaFile = null;
    selectedMediaPreviewUrl = null;
    mediaError = '';
    if (mediaInput) mediaInput.value = '';
  }

  function mergeMessageRow(nextMessage: GroupMessageRow) {
    const existingIndex = messageRows.findIndex((message) => message.id === nextMessage.id);

    if (existingIndex === -1) {
      messageRows = [...messageRows, nextMessage];
      return;
    }

    messageRows = messageRows.map((message, index) => (index === existingIndex ? nextMessage : message));
  }

  async function scrollTimelineToBottom() {
    await tick();
    timelineElement?.scrollTo({ top: timelineElement.scrollHeight, behavior: 'smooth' });
  }

  async function markConversationRead(conversationId: string, userId: string) {
    await supabase
      .from(CONVERSATION_PARTICIPANTS_TABLE)
      .update({ last_read_at: new Date().toISOString() } as never)
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
  }

  async function loadMessageRows(conversationId: string) {
    const { data, error } = await supabase
      .from(MESSAGES_TABLE)
      .select('id, conversation_id, sender_id, content, media_url, media_type, is_deleted, created_at, updated_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    messageRows = (data ?? []) as GroupMessageRow[];
    syncMessageItems();
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
      .channel(`group-messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const nextMessage = payload.new as GroupMessageRow;
          if (!nextMessage?.id) return;

          mergeMessageRow(nextMessage);
          syncMessageItems();
          void scrollTimelineToBottom();

          if (nextMessage.sender_id !== userId) {
            void markConversationRead(conversationId, userId).catch((error) => {
              console.error('Error marking group conversation as read:', error);
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void loadMessageRows(conversationId);
        }
      });

    pollTimer = setInterval(() => {
      void loadMessageRows(conversationId).catch((error) => console.error('Error polling group messages:', error));
    }, POLL_INTERVAL_MS);
  }

  async function loadConversation() {
    const user = $auth.user;
    const conversationId = $page.params.id;

    if (!user || !conversationId) {
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
        .from(CONVERSATIONS_TABLE)
        .select('id, is_group, name, avatar_url, last_message_at, created_at')
        .eq('id', conversationId)
        .eq('is_group', true)
        .maybeSingle();

      if (conversationError) throw conversationError;
      if (!conversationRow) throw new Error('Group conversation not found');

      const { data: participantRows, error: participantsError } = await supabase
        .from(CONVERSATION_PARTICIPANTS_TABLE)
        .select(
          `
            conversation_id,
            user_id,
            is_active,
            role,
            profile:profiles!conversation_participants_user_id_fkey ( id, username, display_name, avatar_url )
          `
        )
        .eq('conversation_id', conversationId);

      if (participantsError) throw participantsError;

      const resolvedView = buildGroupConversationView(
        conversationRow as GroupConversationRow,
        (participantRows ?? []) as GroupParticipantRow[]
      );

      if (!resolvedView || !resolvedView.participants.some((participant) => participant.userId === user.id)) {
        throw new Error('Group conversation is not accessible');
      }

      const resolvedAvatarUrl = await resolveStorageImageUrl(resolvedView.avatarUrl);

      if (requestId !== latestRequest || $auth.user?.id !== user.id || $page.params.id !== conversationId) {
        return;
      }

      conversation = { ...resolvedView, avatarUrl: resolvedAvatarUrl ?? null };

      await loadMessageRows(conversationId);
      await markConversationRead(conversationId, user.id);

      if (requestId !== latestRequest || $auth.user?.id !== user.id || $page.params.id !== conversationId) {
        return;
      }

      startLiveUpdates(conversationId, user.id);
      await scrollTimelineToBottom();
    } catch (error) {
      if (requestId !== latestRequest) return;

      console.error('Error loading group conversation:', error);
      clearLiveUpdates();
      conversation = null;
      messageRows = [];
      syncMessageItems();
      loadError = 'No encontramos este grupo o no tienes acceso a él ahora mismo.';
    } finally {
      if (requestId === latestRequest) loading = false;
    }
  }

  async function sendMessage() {
    const userId = activeUserId;
    const conversationId = activeConversationId;
    const trimmedDraft = draft.trim();
    const mediaFile = selectedMediaFile;

    if (!userId || !conversationId || !conversation || (!trimmedDraft && !mediaFile) || sending) {
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

      if (error) throw error;

      draft = '';
      clearSelectedMedia();
      sendSuccess = 'Mensaje enviado.';
      mergeMessageRow(data as GroupMessageRow);
      syncMessageItems();
      await markConversationRead(conversationId, userId);
      await scrollTimelineToBottom();
    } catch (error) {
      if (uploadedMediaRef) {
        await deleteMessageMedia(uploadedMediaRef).catch(() => {});
      }

      console.error('Error sending group message:', error);
      sendError = 'No pudimos enviar tu mensaje. Inténtalo otra vez.';
    } finally {
      sending = false;
    }
  }

  function openMessageReport(message: GroupMessageItem) {
    if (!conversation || message.isOwnMessage) return;

    reportTarget = {
      type: 'message',
      id: message.id,
      ownerId: message.senderId,
      label: `el mensaje de ${message.senderName} en ${conversation.name}`
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
      reportModalOpen = false;
      reportTarget = null;
    }
  }

  onDestroy(() => {
    clearLiveUpdates();
    if (selectedMediaPreviewUrl) URL.revokeObjectURL(selectedMediaPreviewUrl);
  });
</script>

<div class="min-h-screen bg-dark-950 px-4 py-6">
  <div class="mx-auto max-w-4xl space-y-6">
    <header class="flex flex-col gap-4 rounded-3xl p-5 shadow-lg ring-1 sm:flex-row sm:items-center sm:justify-between bg-gray-800 ring-gray-700">
      <div class="min-w-0">
        <a href="/messages" class="text-sm font-medium transition hover:text-primary-700 text-primary-400">
          ← Volver a mensajes
        </a>

        {#if conversation}
          <div class="mt-4 flex min-w-0 items-center gap-4">
            {#if conversation.avatarUrl}
              <img src={conversation.avatarUrl} alt={conversation.name} class="h-16 w-16 rounded-2xl object-cover shadow-sm" />
            {:else}
              <div class="flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-bold bg-fuchsia-950/40 text-fuchsia-300">
                {getInitials(conversation.name)}
              </div>
            {/if}

            <div class="min-w-0">
              <h1 class="truncate text-2xl font-bold text-white">{conversation.name}</h1>
              <p class="truncate text-sm text-gray-400">
                {conversation.participants.length} participantes ·
                {conversation.participants.map((p) => p.displayName).join(', ')}
              </p>
            </div>
          </div>
        {:else}
          <div class="mt-4">
            <h1 class="text-2xl font-bold text-white">Grupo</h1>
          </div>
        {/if}
      </div>

      <button
        type="button"
        on:click={loadConversation}
        disabled={loading}
        class="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if loading}Actualizando…{:else}Actualizar{/if}
      </button>
    </header>

    {#if loading}
      <section class="rounded-3xl px-6 py-12 text-center shadow-lg bg-gray-800">
        <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
        <p class="mt-4 text-sm text-gray-400">Cargando grupo…</p>
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
              <p class="mt-2 text-sm text-gray-400">Rompe el hielo con el primer mensaje del grupo.</p>
            </div>
          {:else}
            {#each messageItems as message (message.id)}
              <div class={`flex ${message.isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                <article
                  class={`max-w-[85%] rounded-3xl px-4 py-3 shadow-sm ${message.isOwnMessage ? 'bg-primary-600 text-white' : 'bg-gray-900 text-gray-100'}`}
                >
                  <div class="flex items-start justify-between gap-3">
                    <p class={`text-xs font-semibold uppercase tracking-wide ${message.isOwnMessage ? 'text-primary-100' : 'text-gray-400'}`}>
                      {message.senderName}
                    </p>

                    <button
                      type="button"
                      on:click={() => openMessageReport(message)}
                      disabled={message.isOwnMessage}
                      class={`shrink-0 text-xs font-semibold transition ${message.isOwnMessage ? 'cursor-not-allowed text-primary-200/70 opacity-70' : 'text-rose-300 hover:text-rose-200'}`}
                    >
                      Reportar
                    </button>
                  </div>

                  {#if message.mediaUrl && resolvedMediaUrls[message.id]}
                    <img src={resolvedMediaUrls[message.id]} alt="Imagen enviada en el grupo" class="mt-2 max-h-72 w-full rounded-2xl object-cover" loading="lazy" />
                  {:else if message.mediaUrl}
                    <div class="mt-2 flex h-24 w-full items-center justify-center rounded-2xl bg-black/10 text-xs">Cargando imagen…</div>
                  {/if}

                  {#if message.content}
                    <p class={`mt-2 whitespace-pre-wrap text-sm leading-6 ${message.isDeleted ? 'italic opacity-80' : ''}`}>{message.content}</p>
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

        <form class="rounded-3xl p-5 shadow-lg ring-1 bg-gray-800 ring-gray-700" on:submit|preventDefault={sendMessage}>
          <label for="group-message-draft" class="text-sm font-semibold text-white">Escribe un mensaje</label>
          <textarea
            id="group-message-draft"
            bind:value={draft}
            rows="4"
            maxlength="2000"
            placeholder="Escribe algo para el grupo…"
            class="mt-3 w-full rounded-2xl border px-4 py-3 text-sm shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200 border-gray-600 bg-gray-900 text-white"
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
