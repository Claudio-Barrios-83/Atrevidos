<script lang="ts">
  import type { HomepageFeedPost as FeedPost } from '$lib/feed';

  // Componente de presentación: no maneja su propio estado de negocio (likes,
  // comentarios, bloqueos), sólo recibe el post y funciones callback desde el
  // feed padre, que es quien mantiene el estado compartido entre publicaciones
  // (mapas de versión de mutaciones, lista de bloqueados, etc.).
  export let post: FeedPost;
  export let currentUserId: string | null;
  export let isBlocking: boolean;
  export let onToggleLike: (postId: string) => void;
  export let onToggleComments: (postId: string) => void;
  export let onCreateComment: (postId: string) => void;
  export let onDeleteComment: (postId: string, commentId: string) => void;
  export let onBlockAuthor: (post: FeedPost) => void;
  export let onReport: (post: FeedPost) => void;

  $: isOwnPost = post.user_id === currentUserId;
</script>

<article class="rounded-2xl bg-dark-800/70 p-6 shadow-lg shadow-black/30 ring-1 ring-white/10 backdrop-blur-sm">
  <div class="flex items-start space-x-3">
    <div class="flex-shrink-0">
      {#if post.profile?.avatar_url}
        <img
          src={post.profile.avatar_url}
          alt={post.profile.display_name || post.profile.username || 'Avatar'}
          class="h-10 w-10 rounded-full object-cover"
        />
      {:else}
        <div class="flex h-10 w-10 items-center justify-center rounded-full font-bold bg-primary-900 text-primary-300">
          {post.profile?.display_name?.[0] || post.profile?.username?.[0] || 'U'}
        </div>
      {/if}
    </div>

    <div class="min-w-0 flex-grow">
      <div class="flex items-center space-x-2">
        <span class="font-semibold text-white">
          {post.profile?.display_name || post.profile?.username || 'Usuario'}
        </span>
        <span class="text-sm text-gray-400">
          {new Date(post.created_at).toLocaleDateString()}
        </span>
      </div>

      {#if post.content}
        <p class="mt-2 whitespace-pre-wrap text-gray-200">{post.content}</p>
      {/if}

      {#if post.image_urls.length > 0}
        <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {#each post.image_urls as imageUrl, index}
            <img
              src={imageUrl}
              alt={`Imagen ${index + 1} de la publicación de ${post.profile?.display_name || post.profile?.username || 'Usuario'}`}
              loading="lazy"
              class="max-h-80 w-full rounded-xl object-cover bg-gray-900"
            />
          {/each}
        </div>
      {/if}

      <div class="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-400">
        <button
          type="button"
          on:click={() => onToggleLike(post.id)}
          disabled={post.like_pending}
          aria-pressed={post.viewer_has_liked}
          class:text-primary-600={post.viewer_has_liked}
          class:text-gray-500={!post.viewer_has_liked}
          class="flex items-center space-x-1 rounded-lg px-2 py-1 transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-gray-700"
        >
          <svg class="h-5 w-5" fill={post.viewer_has_liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
          <span>{post.like_count || 0}</span>
          <span>{post.viewer_has_liked ? 'Te gusta' : 'Me gusta'}</span>
        </button>
        <button
          type="button"
          on:click={() => onToggleComments(post.id)}
          aria-expanded={post.comment_state.isOpen}
          class="flex items-center space-x-1 rounded-lg px-2 py-1 transition hover:bg-gray-700"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
          <span>{post.comment_count || 0}</span>
          <span>{post.comment_state.isOpen ? 'Ocultar comentarios' : 'Comentarios'}</span>
        </button>
        <button
          type="button"
          on:click={() => onBlockAuthor(post)}
          disabled={isOwnPost || isBlocking}
          aria-label={isOwnPost ? 'No puedes bloquearte a ti misma/o.' : 'Bloquear a esta persona'}
          title={isOwnPost ? 'No puedes bloquearte a ti misma/o.' : 'Bloquear a esta persona'}
          class={`rounded-lg px-2 py-1 font-semibold transition ${isOwnPost ? 'cursor-not-allowed opacity-70 text-gray-500' : 'text-amber-300 hover:bg-amber-950/30 hover:text-amber-200'}`}
        >
          {#if isBlocking}Bloqueando…{:else}Bloquear{/if}
        </button>
        <button
          type="button"
          on:click={() => onReport(post)}
          disabled={isOwnPost}
          aria-label={isOwnPost ? 'No puedes reportarte a ti misma/o.' : 'Reportar esta publicación'}
          title={isOwnPost ? 'No puedes reportarte a ti misma/o.' : 'Reportar esta publicación'}
          class={`rounded-lg px-2 py-1 font-semibold transition ${isOwnPost ? 'cursor-not-allowed opacity-70 text-gray-500' : 'text-rose-300 hover:bg-rose-950/30 hover:text-rose-200'}`}
        >
          Reportar
        </button>
      </div>

      {#if post.comment_state.isOpen}
        <section class="mt-4 rounded-xl border p-4 border-gray-700 bg-gray-900/60">
          <div class="flex flex-col gap-3">
            <label class="sr-only" for={`comment-${post.id}`}>Escribe un comentario</label>
            <textarea
              id={`comment-${post.id}`}
              bind:value={post.comment_state.composerValue}
              rows="2"
              maxlength="500"
              placeholder="Escribe un comentario..."
              disabled={post.comment_state.submitPending}
              class="w-full resize-none rounded-lg border p-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-70 border-gray-700 bg-gray-800 text-white"
            ></textarea>
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs text-gray-400">
                {post.comment_state.composerValue.trim().length}/500 caracteres
              </p>
              <button
                type="button"
                on:click={() => onCreateComment(post.id)}
                disabled={post.comment_state.submitPending || !post.comment_state.composerValue.trim()}
                class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {#if post.comment_state.submitPending}Enviando...{:else}Comentar{/if}
              </button>
            </div>
          </div>

          {#if post.comment_state.error}
            <p class="mt-3 rounded-lg px-3 py-2 text-sm bg-red-950/40 text-red-300">
              {post.comment_state.error}
            </p>
          {/if}

          <div class="mt-4 space-y-3">
            {#if post.comment_state.isLoading}
              <p class="text-sm text-gray-400">Cargando comentarios...</p>
            {:else if post.comment_state.hasLoaded && post.comment_state.items.length === 0}
              <p class="text-sm text-gray-400">Aún no hay comentarios. Sé la primera persona en comentar.</p>
            {:else}
              {#each post.comment_state.items as comment (comment.id)}
                <article class="rounded-lg p-3 shadow-sm bg-gray-800">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-sm font-semibold text-white">
                          {comment.profile?.display_name || comment.profile?.username || 'Usuario'}
                        </span>
                        <span class="text-xs text-gray-400">
                          {new Date(comment.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p class="mt-2 whitespace-pre-wrap text-sm text-gray-200">{comment.content}</p>
                    </div>

                    {#if comment.user_id === currentUserId}
                      <button
                        type="button"
                        on:click={() => onDeleteComment(post.id, comment.id)}
                        disabled={comment.delete_pending}
                        class="rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 border-red-900/60 text-red-300 hover:bg-red-950/30"
                      >
                        {#if comment.delete_pending}Eliminando...{:else}Eliminar{/if}
                      </button>
                    {/if}
                  </div>
                </article>
              {/each}
            {/if}
          </div>
        </section>
      {/if}
    </div>
  </div>
</article>
