<script lang="ts">
  import {
    buildHomepageFeedQuery,
    normalizeHomepageFeedPost,
    parseHomepagePublicFeedRows,
    removeHomepageFeedPostsByUser,
    type HomepageFeedPost as FeedPost
  } from '$lib/feed';
  import { collectBlockedUserIds, excludeRowsFromBlockedUsers, type DiscoverMatchRow } from '$lib/discover';
  import {
    applyCreatedComment,
    applyDeletedComment,
    beginCommentLoad,
    buildCommentInsert,
    invalidateCommentLoad,
    isCurrentCommentLoadContext,
    isLatestCommentLoad,
    normalizeFeedComments,
    toCommentActionErrorMessage,
    toggleCommentThread,
    type CommentLoadVersions,
    type FeedCommentState,
    type RawFeedComment
  } from '$lib/comments';
  import {
    beginPostMutation,
    buildLikeInsert,
    collectCurrentUserLikedPostIds,
    hydrateFeedPostReactions,
    invalidatePostMutation,
    isLatestPostMutation,
    togglePostLikeOptimistically,
    type FeedLikeRow,
    type PostMutationVersions
  } from '$lib/reactions';
  import { saveDiscoverMatch } from '$lib/discover-actions';
  import { auth } from '$lib';
  import ReportModal from '$lib/components/report-modal.svelte';
  import PostComposer from '$lib/components/post-composer.svelte';
  import PostCard from '$lib/components/post-card.svelte';
  import { supabase } from '$lib/supabase/client';
  import { resolveStorageImageUrl } from '$lib/supabase/profile-media';
  import { resolvePostImageUrls } from '$lib/supabase/post-media';
  import type { ReportTarget } from '$lib/reports';
  import LoadingState from '$lib/components/loading-state.svelte';
  import ErrorState from '$lib/components/error-state.svelte';
  import AppShell from '$lib/components/app-shell.svelte';

  type FeedTab = 'todos' | 'mias';

  const FEED_PAGE_SIZE = 20;

  let activeUserId: string | null = null;
  let latestFeedRequest = 0;
  let posts: FeedPost[] = [];
  const postMutationVersions: PostMutationVersions = new Map();
  const commentLoadVersions: CommentLoadVersions = new Map();
  let loading = false;
  let feedError = '';
  let signingOut = false;
  let reactionError = '';
  let sessionError = '';
  let reportModalOpen = false;
  let reportTarget: ReportTarget | null = null;
  let reportFeedback = '';
  let blockingUserIds: Record<string, boolean> = {};
  let localBlockedUserIds = new Set<string>();
  let activeTab: FeedTab = 'todos';

  $: visiblePosts = activeTab === 'mias' ? posts.filter((post) => post.user_id === $auth.user?.id) : posts;

  async function resolveFeedPostAssets(feedPosts: FeedPost[]) {
    const resolvedAssets = await Promise.all(
      feedPosts.map(async (post) => {
        const [avatarResult, imageResult] = await Promise.allSettled([
          resolveStorageImageUrl(post.profile?.avatar_url),
          resolvePostImageUrls(post.image_urls)
        ]);

        return {
          avatarUrl: avatarResult.status === 'fulfilled' ? (avatarResult.value ?? null) : post.profile?.avatar_url ?? null,
          imageUrls:
            imageResult.status === 'fulfilled'
              ? imageResult.value.filter((value): value is string => Boolean(value))
              : post.image_urls
        };
      })
    );

    return feedPosts.map((post, index) => ({
      ...post,
      profile: post.profile
        ? {
            ...post.profile,
            avatar_url: resolvedAssets[index]?.avatarUrl ?? null
          }
        : null,
      image_urls: resolvedAssets[index]?.imageUrls ?? []
    }));
  }

  function loadBlockedUserIds(userId: string) {
    return supabase
      .from('matches')
      .select('user_id, target_user_id, match_type')
      .eq('match_type', 'block')
      .or(`user_id.eq.${userId},target_user_id.eq.${userId}`);
  }

  function updatePost(postId: string, updater: (post: FeedPost) => FeedPost) {
    posts = posts.map((post) => (post.id === postId ? updater(post) : post));
  }

  function updateCommentState(postId: string, updater: (state: FeedCommentState) => FeedCommentState) {
    updatePost(postId, (post) => ({
      ...post,
      comment_state: updater(post.comment_state)
    }));
  }

  async function loadComments(postId: string, options: { force?: boolean } = {}) {
    const user = $auth.user;
    const existingPost = posts.find((post) => post.id === postId);

    if (!user || !existingPost) {
      return;
    }

    if (existingPost.comment_state.isLoading || (existingPost.comment_state.hasLoaded && !options.force)) {
      return;
    }

    const requestUserId = user.id;
    const loadVersion = beginCommentLoad(commentLoadVersions, postId);

    updateCommentState(postId, (state) => ({
      ...state,
      isLoading: true,
      error: ''
    }));

    try {
      const [{ data, error }, { data: blockedRows, error: blockedError }] = await Promise.all([
        supabase
          .from('comments')
          .select(
            `
              id,
              user_id,
              post_id,
              parent_comment_id,
              content,
              is_edited,
              like_count,
              is_hidden,
              created_at,
              updated_at,
              profiles (username, avatar_url, display_name)
            `
          )
          .eq('post_id', postId)
          .is('parent_comment_id', null)
          .order('created_at', { ascending: true }),
        loadBlockedUserIds(requestUserId)
      ]);

      if (error) {
        throw error;
      }

      if (blockedError) {
        throw blockedError;
      }

      if (
        !isLatestCommentLoad(commentLoadVersions, postId, loadVersion) ||
        !isCurrentCommentLoadContext({
          requestUserId,
          currentAuthUserId: $auth.user?.id,
          activeUserId
        }) ||
        !posts.some((post) => post.id === postId)
      ) {
        return;
      }

      const blockedUserIds = collectBlockedUserIds((blockedRows ?? []) as DiscoverMatchRow[], requestUserId);
      const visibleComments = excludeRowsFromBlockedUsers((data ?? []) as unknown as RawFeedComment[], blockedUserIds);
      const normalizedComments = normalizeFeedComments(visibleComments);

      updateCommentState(postId, (state) => ({
        ...state,
        isLoading: false,
        hasLoaded: true,
        error: '',
        items: normalizedComments
      }));
    } catch (error) {
      console.error('Error loading comments:', error);

      if (
        !isLatestCommentLoad(commentLoadVersions, postId, loadVersion) ||
        !isCurrentCommentLoadContext({
          requestUserId,
          currentAuthUserId: $auth.user?.id,
          activeUserId
        }) ||
        !posts.some((post) => post.id === postId)
      ) {
        return;
      }

      updateCommentState(postId, (state) => ({
        ...state,
        isLoading: false,
        error: 'No pudimos cargar los comentarios. Inténtalo de nuevo.'
      }));
    }
  }

  async function togglePostComments(postId: string) {
    const existingPost = posts.find((post) => post.id === postId);

    if (!existingPost) {
      return;
    }

    const nextState = toggleCommentThread(existingPost.comment_state);
    updateCommentState(postId, () => nextState);

    if (nextState.isOpen && !nextState.hasLoaded && !nextState.isLoading) {
      await loadComments(postId);
    }
  }

  async function createComment(postId: string) {
    const user = $auth.user;
    const existingPost = posts.find((post) => post.id === postId);
    const content = existingPost?.comment_state.composerValue.trim() ?? '';

    if (!user) {
      reactionError = 'Tu sesión expiró. Vuelve a iniciar sesión para comentar.';
      return;
    }

    if (!existingPost || existingPost.comment_state.submitPending) {
      return;
    }

    if (!content) {
      updateCommentState(postId, (state) => ({
        ...state,
        error: 'Escribe un comentario antes de enviarlo.'
      }));
      return;
    }

    updateCommentState(postId, (state) => ({
      ...state,
      submitPending: true,
      error: ''
    }));

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert([buildCommentInsert(user.id, postId, content)])
        .select(
          `
            id,
            user_id,
            post_id,
            parent_comment_id,
            content,
            is_edited,
            like_count,
            is_hidden,
            created_at,
            updated_at,
            profiles (username, avatar_url, display_name)
          `
        )
        .single();

      if (error) {
        throw error;
      }

      const createdComment = normalizeFeedComments([data as unknown as RawFeedComment])[0];

      if (!createdComment) {
        throw new Error('No pudimos preparar el comentario creado.');
      }

      invalidateCommentLoad(commentLoadVersions, postId);
      updatePost(postId, (post) => applyCreatedComment(post, createdComment));
    } catch (error) {
      console.error('Error creating comment:', error);
      updateCommentState(postId, (state) => ({
        ...state,
        submitPending: false,
        error: toCommentActionErrorMessage(error)
      }));
    }
  }

  async function deleteComment(postId: string, commentId: string) {
    const user = $auth.user;
    const existingPost = posts.find((post) => post.id === postId);
    const existingComment = existingPost?.comment_state.items.find((comment) => comment.id === commentId);

    if (!user) {
      reactionError = 'Tu sesión expiró. Vuelve a iniciar sesión para comentar.';
      return;
    }

    if (!existingPost || !existingComment || existingComment.user_id !== user.id || existingComment.delete_pending) {
      return;
    }

    updateCommentState(postId, (state) => ({
      ...state,
      error: '',
      items: state.items.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              delete_pending: true
            }
          : comment
      )
    }));

    try {
      const { error } = await supabase.from('comments').delete().eq('id', commentId).eq('user_id', user.id);

      if (error) {
        throw error;
      }

      invalidateCommentLoad(commentLoadVersions, postId);
      updatePost(postId, (post) => applyDeletedComment(post, commentId));
    } catch (error) {
      console.error('Error deleting comment:', error);
      updateCommentState(postId, (state) => ({
        ...state,
        error: 'No pudimos eliminar tu comentario. Inténtalo de nuevo.',
        items: state.items.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                delete_pending: false
              }
            : comment
        )
      }));
    }
  }

  async function loadPosts() {
    const requestId = ++latestFeedRequest;
    const user = $auth.user;

    if (!user) {
      posts = [];
      postMutationVersions.clear();
      loading = false;
      return;
    }

    loading = true;
    feedError = '';
    reactionError = '';

    try {
      const blockedIdsPromise = loadBlockedUserIds(user.id);
      const postsPromise = buildHomepageFeedQuery(supabase, FEED_PAGE_SIZE);

      const [{ data: blockedRows, error: blockedError }, { data, error }] = await Promise.all([
        blockedIdsPromise,
        postsPromise
      ]);

      if (blockedError) {
        throw blockedError;
      }

      if (error) {
        throw error;
      }

      if (requestId !== latestFeedRequest || $auth.user?.id !== user.id || user.id !== activeUserId) {
        return;
      }

      const blockedUserIds = collectBlockedUserIds((blockedRows ?? []) as DiscoverMatchRow[], user.id);
      for (const blockedUserId of localBlockedUserIds) {
        blockedUserIds.add(blockedUserId);
      }

      const visiblePosts = parseHomepagePublicFeedRows(data ?? []).filter(
        (post) => !blockedUserIds.has(post.user_id)
      ).map(normalizeHomepageFeedPost);
      const postIds = visiblePosts.map((post) => post.id);
      const likesPromise = postIds.length
        ? supabase
            .from('likes')
            .select('id, post_id, user_id, reaction_type, created_at')
            .eq('user_id', user.id)
            .eq('reaction_type', 'like')
            .in('post_id', postIds)
        : Promise.resolve({ data: [] as FeedLikeRow[], error: null });
      const [resolvedPosts, { data: likeRows, error: likesError }] = await Promise.all([
        resolveFeedPostAssets(visiblePosts),
        likesPromise
      ]);

      if (likesError) {
        throw likesError;
      }

      if (requestId !== latestFeedRequest || $auth.user?.id !== user.id || user.id !== activeUserId) {
        return;
      }

      const likedPostIds = collectCurrentUserLikedPostIds((likeRows ?? []) as FeedLikeRow[], user.id);
      const hydratedPosts = hydrateFeedPostReactions(resolvedPosts, likedPostIds);

      for (const post of hydratedPosts) {
        invalidatePostMutation(postMutationVersions, post.id);
        invalidateCommentLoad(commentLoadVersions, post.id);
      }

      posts = hydratedPosts;
    } catch (error) {
      if (requestId !== latestFeedRequest || $auth.user?.id !== user.id || user.id !== activeUserId) {
        return;
      }

      console.error('Error loading posts:', error);
      feedError = 'No pudimos cargar el feed. Inténtalo de nuevo.';
    } finally {
      if (requestId === latestFeedRequest) {
        loading = false;
      }
    }
  }

  async function handleSignOut() {
    if (signingOut) return;

    sessionError = '';
    signingOut = true;

    try {
      await auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      sessionError = 'No pudimos cerrar tu sesión. Inténtalo de nuevo.';
    } finally {
      signingOut = false;
    }
  }

  async function togglePostLike(postId: string) {
    const user = $auth.user;

    if (!user) {
      reactionError = 'Tu sesión expiró. Vuelve a iniciar sesión para reaccionar.';
      return;
    }

    const existingPost = posts.find((post) => post.id === postId);

    if (!existingPost || existingPost.like_pending) {
      return;
    }

    reactionError = '';

    const mutationVersion = beginPostMutation(postMutationVersions, postId);
    const previousPost = { ...existingPost };
    const shouldUnlike = existingPost.viewer_has_liked;

    updatePost(postId, (post) => togglePostLikeOptimistically(post));

    try {
      if (shouldUnlike) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', postId)
          .eq('reaction_type', 'like');

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from('likes').insert([buildLikeInsert(user.id, postId)]);

        if (error) {
          throw error;
        }
      }

      if (!isLatestPostMutation(postMutationVersions, postId, mutationVersion)) {
        return;
      }

      updatePost(postId, (post) => ({
        ...post,
        like_pending: false
      }));
    } catch (error) {
      console.error('Error toggling post like:', error);

      if (!isLatestPostMutation(postMutationVersions, postId, mutationVersion)) {
        return;
      }

      updatePost(postId, () => previousPost);
      reactionError = 'No pudimos actualizar tu reacción. Inténtalo de nuevo.';
    }
  }

  async function blockPostAuthor(post: FeedPost) {
    const user = $auth.user;

    if (!user) {
      reactionError = 'Tu sesión expiró. Vuelve a iniciar sesión para bloquear perfiles.';
      return;
    }

    if (post.user_id === user.id || blockingUserIds[post.user_id]) {
      return;
    }

    reactionError = '';
    reportFeedback = '';
    blockingUserIds = { ...blockingUserIds, [post.user_id]: true };
    latestFeedRequest += 1;
    localBlockedUserIds = new Set([...localBlockedUserIds, post.user_id]);

    try {
      await saveDiscoverMatch(user.id, post.user_id, 'block');
      const blockedUserId = post.user_id;
      const remainingPosts = removeHomepageFeedPostsByUser(posts, blockedUserId).map((item) => {
        const visibleItems = item.comment_state.items.filter((comment) => comment.user_id !== blockedUserId);
        const removedVisibleComments = item.comment_state.items.length - visibleItems.length;

        return {
          ...item,
          comment_count: Math.max(0, item.comment_count - removedVisibleComments),
          comment_state: {
            ...item.comment_state,
            isLoading: false,
            items: visibleItems
          }
        };
      });

      for (const remainingPost of remainingPosts) {
        invalidateCommentLoad(commentLoadVersions, remainingPost.id);
      }

      posts = remainingPosts;
      reportFeedback = `Has bloqueado a ${post.profile?.display_name || post.profile?.username || 'esta persona'} y hemos ocultado su contenido.`;
    } catch (error) {
      console.error('Error blocking feed post author:', error);
      localBlockedUserIds = new Set([...localBlockedUserIds].filter((blockedUserId) => blockedUserId !== post.user_id));
      reactionError = 'No pudimos bloquear este perfil. Inténtalo de nuevo.';
    } finally {
      blockingUserIds = { ...blockingUserIds, [post.user_id]: false };
    }
  }

  function openPostReport(post: FeedPost) {
    if ($auth.user?.id && post.user_id === $auth.user.id) {
      return;
    }

    reportTarget = {
      type: 'post',
      id: post.id,
      ownerId: post.user_id,
      label: `la publicación de ${post.profile?.display_name || post.profile?.username || 'esta persona'}`
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
    if ($auth.user?.id && $auth.user.id !== activeUserId) {
      activeUserId = $auth.user.id;
      void loadPosts();
    }

    if (!$auth.user) {
      latestFeedRequest += 1;
      activeUserId = null;
      posts = [];
      postMutationVersions.clear();
      commentLoadVersions.clear();
      reactionError = '';
      feedError = '';
      reportFeedback = '';
      blockingUserIds = {};
      localBlockedUserIds = new Set();
      reportModalOpen = false;
      reportTarget = null;
      sessionError = '';
      loading = false;
      signingOut = false;
    }
  }
</script>

<AppShell active="feed" onSignOut={handleSignOut} {signingOut}>
<div class="mx-auto max-w-2xl px-4 py-8">
  <header class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Tu feed</h1>
    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Lo que comparte la comunidad de Atrevidos, en tiempo real.</p>
  </header>

  <div class="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-dark-800">
    <button
      type="button"
      on:click={() => (activeTab = 'todos')}
      class={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
        activeTab === 'todos' ? 'bg-white text-primary-700 shadow dark:bg-dark-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'
      }`}
    >
      Todos
    </button>
    <button
      type="button"
      on:click={() => (activeTab = 'mias')}
      class={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
        activeTab === 'mias' ? 'bg-white text-primary-700 shadow dark:bg-dark-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'
      }`}
    >
      Mis publicaciones
    </button>
  </div>

  {#if sessionError}
    <p class="mb-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
      {sessionError}
    </p>
  {/if}

  {#if reactionError}
    <p class="mb-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
      {reactionError}
    </p>
  {/if}

  {#if reportFeedback}
    <p class="mb-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
      {reportFeedback}
    </p>
  {/if}

  <PostComposer on:published={loadPosts} />

  {#if loading}
    <LoadingState message="Cargando publicaciones..." />
  {:else if feedError}
    <ErrorState message={feedError} retry={loadPosts} />
  {:else if visiblePosts.length === 0}
    <div class="rounded-xl bg-gray-50 py-12 text-center dark:bg-gray-800">
      <p class="text-gray-500 dark:text-gray-400">
        {#if activeTab === 'mias'}
          Todavía no publicaste nada. ¡Compartí algo desde el cuadro de arriba!
        {:else}
          Aún no hay publicaciones públicas. ¡Sé la primera persona en compartir algo!
        {/if}
      </p>
    </div>
  {:else}
    <div class="space-y-4">
      {#each visiblePosts as post (post.id)}
        <PostCard
          {post}
          currentUserId={$auth.user?.id ?? null}
          isBlocking={!!blockingUserIds[post.user_id]}
          onToggleLike={togglePostLike}
          onToggleComments={togglePostComments}
          onCreateComment={createComment}
          onDeleteComment={deleteComment}
          onBlockAuthor={blockPostAuthor}
          onReport={openPostReport}
        />
      {/each}
    </div>
  {/if}
</div>
</AppShell>

<ReportModal
  open={reportModalOpen}
  reporterId={$auth.user?.id ?? null}
  target={reportTarget}
  on:close={closeReportModal}
  on:submitted={handleReportSubmitted}
/>
