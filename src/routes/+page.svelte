<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    buildHomepageFeedQuery,
    normalizeHomepageFeedPost,
    parseHomepagePublicFeedRows,
    removeHomepageFeedPostsByUser,
    type HomepageFeedPost as FeedPost
  } from '$lib/feed';
  import {
    MAX_POST_IMAGES,
    POST_IMAGE_MIME_TYPES,
    getRemainingPostImageSlots,
    normalizePostImageRefs,
    validatePostImageFile
  } from '$lib/post-media';
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
  import { auth } from '$lib/stores/auth';
  import ReportModal from '$lib/components/report-modal.svelte';
  import { supabase } from '$lib/supabase';
  import { resolveStorageImageUrl } from '$lib/supabase/profile-media';
  import { deletePostImage, resolvePostImageUrls, uploadPostImage } from '$lib/supabase/post-media';
  import type { Database } from '$lib/database.types';
  import type { ReportTarget } from '$lib/reports';

  type SelectedPostImage = {
    id: string;
    file: File;
    previewUrl: string;
  };

  const FEED_PAGE_SIZE = 20;
  const POST_IMAGE_ACCEPT = POST_IMAGE_MIME_TYPES.join(',');

  let activeUserId: string | null = null;
  let latestFeedRequest = 0;
  let posts: FeedPost[] = [];
  const postMutationVersions: PostMutationVersions = new Map();
  const commentLoadVersions: CommentLoadVersions = new Map();
  let loading = false;
  let feedError = '';
  let newPostContent = '';
  let postImageInput: HTMLInputElement | null = null;
  let selectedPostImages: SelectedPostImage[] = [];
  let publishing = false;
  let signingOut = false;
  let composeError = '';
  let composeSuccess = '';
  let reactionError = '';
  let sessionError = '';
  let reportModalOpen = false;
  let reportTarget: ReportTarget | null = null;
  let reportFeedback = '';
  let blockingUserIds: Record<string, boolean> = {};
  let localBlockedUserIds = new Set<string>();

  $: selectedPostImageCount = selectedPostImages.length;
  $: remainingPostImageSlots = getRemainingPostImageSlots(selectedPostImageCount);


  function buildPostImageUploadId(index: number) {
    const randomPart =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    return `${Date.now()}-${index}-${randomPart}`;
  }

  function revokeSelectedPostImagePreviews(images: SelectedPostImage[]) {
    for (const image of images) {
      URL.revokeObjectURL(image.previewUrl);
    }
  }

  function replaceSelectedPostImages(nextImages: SelectedPostImage[]) {
    revokeSelectedPostImagePreviews(selectedPostImages);
    selectedPostImages = nextImages;
  }

  function clearSelectedPostImages() {
    replaceSelectedPostImages([]);

    if (postImageInput) {
      postImageInput.value = '';
    }
  }

  function removeSelectedPostImage(imageId: string) {
    const imageToRemove = selectedPostImages.find((image) => image.id === imageId);

    if (!imageToRemove || publishing) {
      return;
    }

    URL.revokeObjectURL(imageToRemove.previewUrl);
    selectedPostImages = selectedPostImages.filter((image) => image.id !== imageId);
    composeError = '';
    composeSuccess = '';

    if (postImageInput) {
      postImageInput.value = '';
    }
  }

  function validateSelectedPostImages(images: File[]) {
    for (const file of images) {
      const validation = validatePostImageFile(file);

      if (!validation.valid) {
        return validation;
      }
    }

    return { valid: true, error: '' } as const;
  }

  function handlePostImagesChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    composeError = '';
    composeSuccess = '';

    if (files.length === 0) {
      return;
    }

    if (files.length > remainingPostImageSlots) {
      composeError = `Puedes adjuntar hasta ${MAX_POST_IMAGES} imágenes por publicación.`;
      input.value = '';
      return;
    }

    const validation = validateSelectedPostImages(files);

    if (!validation.valid) {
      composeError = validation.error;
      input.value = '';
      return;
    }

    selectedPostImages = [
      ...selectedPostImages,
      ...files.map((file, index) => ({
        id: buildPostImageUploadId(selectedPostImages.length + index),
        file,
        previewUrl: URL.createObjectURL(file)
      }))
    ];
    input.value = '';
  }

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
      const visibleComments = excludeRowsFromBlockedUsers((data ?? []) as RawFeedComment[], blockedUserIds);
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

      const createdComment = normalizeFeedComments([data as RawFeedComment])[0];

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

  async function createPost() {
    if (publishing) return;

    const content = newPostContent.trim();
    const user = $auth.user;

    if (!user) {
      composeError = 'Tu sesión expiró. Vuelve a iniciar sesión para publicar.';
      composeSuccess = '';
      return;
    }

    if (!content && selectedPostImages.length === 0) {
      composeError = 'Escribe algo o adjunta al menos una imagen antes de publicar.';
      composeSuccess = '';
      return;
    }

    if (selectedPostImages.length > MAX_POST_IMAGES) {
      composeError = `Puedes adjuntar hasta ${MAX_POST_IMAGES} imágenes por publicación.`;
      composeSuccess = '';
      return;
    }

    const validation = validateSelectedPostImages(selectedPostImages.map((image) => image.file));

    if (!validation.valid) {
      composeError = validation.error;
      composeSuccess = '';
      return;
    }

    publishing = true;
    composeError = '';
    composeSuccess = '';
    const uploadedImageRefs: string[] = [];

    try {
      for (const [index, image] of selectedPostImages.entries()) {
        const uploadedImageRef = await uploadPostImage(user.id, image.file, buildPostImageUploadId(index));
        uploadedImageRefs.push(uploadedImageRef);
      }

      const post = {
        user_id: user.id,
        content,
        image_urls: normalizePostImageRefs(uploadedImageRefs),
        visibility: 'public',
        is_anonymous: false,
        is_archived: false
      } satisfies Database['public']['Tables']['posts']['Insert'];

      const { error } = await supabase.from('posts').insert([post]);

      if (error) {
        throw error;
      }

      newPostContent = '';
      clearSelectedPostImages();
      composeSuccess = 'Publicación creada correctamente.';
      await loadPosts();
    } catch (error) {
      await Promise.allSettled(uploadedImageRefs.map((reference) => deletePostImage(reference)));
      console.error('Error creating post:', error);
      composeError = 'No pudimos publicar tu mensaje o subir sus imágenes. Inténtalo de nuevo.';
    } finally {
      publishing = false;
    }
  }

  async function handleSignOut() {
    if (publishing || signingOut) return;

    composeError = '';
    composeSuccess = '';
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
      newPostContent = '';
      clearSelectedPostImages();
      composeError = '';
      composeSuccess = '';
      reactionError = '';
      feedError = '';
      reportFeedback = '';
      blockingUserIds = {};
      localBlockedUserIds = new Set();
      reportModalOpen = false;
      reportTarget = null;
      sessionError = '';
      loading = false;
      publishing = false;
      signingOut = false;
    }
  }

  onDestroy(() => {
    revokeSelectedPostImagePreviews(selectedPostImages);
  });
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
  <header class="mb-8 flex items-center justify-between gap-4">
    <div>
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Atrevidos</h1>
      {#if $auth.user?.email}
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Sesión activa como {$auth.user.email}</p>
      {/if}
    </div>

    <div class="flex items-center gap-3">
      <a
        href="/discover"
        class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        Descubrir
      </a>

      <a
        href="/matches"
        class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        Matches
      </a>

      <a
        href="/messages"
        class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        Mensajes
      </a>

      <a
        href="/profile"
        class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        Mi perfil
      </a>

      <button
        type="button"
        on:click={handleSignOut}
        disabled={signingOut}
        class="text-sm text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:text-white"
      >
        {#if signingOut}Cerrando...{:else}Cerrar sesión{/if}
      </button>
    </div>
  </header>

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

  <section class="mb-6 rounded-xl bg-white p-4 shadow dark:bg-gray-800">
    <label class="sr-only" for="new-post">Nueva publicación</label>
    <textarea
      id="new-post"
      bind:value={newPostContent}
      placeholder="¿Qué estás pensando?"
      class="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
      rows="3"
      disabled={publishing}
      maxlength="500"
    ></textarea>

    <div class="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-medium text-gray-900 dark:text-white">Imágenes para la publicación</p>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Adjunta hasta {MAX_POST_IMAGES} imágenes JPG, PNG o WEBP de 8 MB o menos por archivo.
          </p>
        </div>

        <input
          bind:this={postImageInput}
          type="file"
          accept={POST_IMAGE_ACCEPT}
          multiple
          class="hidden"
          disabled={publishing || remainingPostImageSlots === 0}
          on:change={handlePostImagesChange}
        />

        <button
          type="button"
          on:click={() => postImageInput?.click()}
          disabled={publishing || remainingPostImageSlots === 0}
          class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {#if remainingPostImageSlots === 0}Límite alcanzado{:else}Añadir imágenes{/if}
        </button>
      </div>

      {#if selectedPostImages.length > 0}
        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {#each selectedPostImages as image (image.id)}
            <article class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <img src={image.previewUrl} alt={image.file.name} class="h-28 w-full object-cover" />
              <div class="space-y-2 p-3">
                <p class="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{image.file.name}</p>
                <button
                  type="button"
                  on:click={() => removeSelectedPostImage(image.id)}
                  disabled={publishing}
                  class="w-full rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  Quitar
                </button>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">Aún no has seleccionado imágenes para esta publicación.</p>
      {/if}
    </div>

    <div class="mt-4 flex items-center justify-between gap-3">
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {newPostContent.trim().length}/500 caracteres · {selectedPostImageCount}/{MAX_POST_IMAGES} imágenes
      </p>

      <button
        type="button"
        on:click={createPost}
        disabled={publishing || (!newPostContent.trim() && selectedPostImages.length === 0)}
        class="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if publishing}Publicando...{:else}Publicar{/if}
      </button>
    </div>

    {#if composeError}
      <p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
        {composeError}
      </p>
    {/if}

    {#if composeSuccess}
      <p class="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">
        {composeSuccess}
      </p>
    {/if}
  </section>

  {#if loading}
    <div class="py-12 text-center">
      <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      <p class="mt-4 text-gray-600 dark:text-gray-400">Cargando publicaciones...</p>
    </div>
  {:else if feedError}
    <div class="rounded-xl bg-red-50 p-6 text-center dark:bg-red-950/30">
      <p class="text-sm text-red-700 dark:text-red-300">{feedError}</p>
      <button
        type="button"
        on:click={loadPosts}
        class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
      >
        Reintentar
      </button>
    </div>
  {:else if posts.length === 0}
    <div class="rounded-xl bg-gray-50 py-12 text-center dark:bg-gray-800">
      <p class="text-gray-500 dark:text-gray-400">Aún no hay publicaciones públicas. ¡Sé la primera persona en compartir algo!</p>
    </div>
  {:else}
    <div class="space-y-4">
      {#each posts as post (post.id)}
        <article class="rounded-xl bg-white p-6 shadow dark:bg-gray-800">
          <div class="flex items-start space-x-3">
            <div class="flex-shrink-0">
              {#if post.profile?.avatar_url}
                <img
                  src={post.profile.avatar_url}
                  alt={post.profile.display_name || post.profile.username || 'Avatar'}
                  class="h-10 w-10 rounded-full object-cover"
                />
              {:else}
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                  {post.profile?.display_name?.[0] || post.profile?.username?.[0] || 'U'}
                </div>
              {/if}
            </div>

            <div class="min-w-0 flex-grow">
              <div class="flex items-center space-x-2">
                <span class="font-semibold text-gray-900 dark:text-white">
                  {post.profile?.display_name || post.profile?.username || 'Usuario'}
                </span>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(post.created_at).toLocaleDateString()}
                </span>
              </div>

              {#if post.content}
                <p class="mt-2 whitespace-pre-wrap text-gray-800 dark:text-gray-200">{post.content}</p>
              {/if}

              {#if post.image_urls.length > 0}
                <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {#each post.image_urls as imageUrl, index}
                    <img
                      src={imageUrl}
                      alt={`Imagen ${index + 1} de la publicación de ${post.profile?.display_name || post.profile?.username || 'Usuario'}`}
                      loading="lazy"
                      class="max-h-80 w-full rounded-xl bg-gray-100 object-cover dark:bg-gray-900"
                    />
                  {/each}
                </div>
              {/if}

              <div class="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                <button
                  type="button"
                  on:click={() => togglePostLike(post.id)}
                  disabled={post.like_pending}
                  aria-pressed={post.viewer_has_liked}
                  class:text-pink-600={post.viewer_has_liked}
                  class:text-gray-500={!post.viewer_has_liked}
                  class="flex items-center space-x-1 rounded-lg px-2 py-1 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-700"
                >
                  <svg class="h-5 w-5" fill={post.viewer_has_liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                  <span>{post.like_count || 0}</span>
                  <span>{post.viewer_has_liked ? 'Te gusta' : 'Me gusta'}</span>
                </button>
                <button
                  type="button"
                  on:click={() => togglePostComments(post.id)}
                  aria-expanded={post.comment_state.isOpen}
                  class="flex items-center space-x-1 rounded-lg px-2 py-1 transition hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                  <span>{post.comment_count || 0}</span>
                  <span>{post.comment_state.isOpen ? 'Ocultar comentarios' : 'Comentarios'}</span>
                </button>
                <button
                  type="button"
                  on:click={() => blockPostAuthor(post)}
                  disabled={post.user_id === $auth.user?.id || blockingUserIds[post.user_id]}
                  aria-label={post.user_id === $auth.user?.id ? 'No puedes bloquearte a ti misma/o.' : 'Bloquear a esta persona'}
                  title={post.user_id === $auth.user?.id ? 'No puedes bloquearte a ti misma/o.' : 'Bloquear a esta persona'}
                  class={`rounded-lg px-2 py-1 font-semibold transition ${post.user_id === $auth.user?.id ? 'cursor-not-allowed text-gray-400 opacity-70 dark:text-gray-500' : 'text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30 dark:hover:text-amber-200'}`}
                >
                  {#if blockingUserIds[post.user_id]}Bloqueando…{:else}Bloquear{/if}
                </button>
                <button
                  type="button"
                  on:click={() => openPostReport(post)}
                  disabled={post.user_id === $auth.user?.id}
                  aria-label={post.user_id === $auth.user?.id ? 'No puedes reportarte a ti misma/o.' : 'Reportar esta publicación'}
                  title={post.user_id === $auth.user?.id ? 'No puedes reportarte a ti misma/o.' : 'Reportar esta publicación'}
                  class={`rounded-lg px-2 py-1 font-semibold transition ${post.user_id === $auth.user?.id ? 'cursor-not-allowed text-gray-400 opacity-70 dark:text-gray-500' : 'text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30 dark:hover:text-rose-200'}`}
                >
                  Reportar
                </button>
              </div>

              {#if post.comment_state.isOpen}
                <section class="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
                  <div class="flex flex-col gap-3">
                    <label class="sr-only" for={`comment-${post.id}`}>Escribe un comentario</label>
                    <textarea
                      id={`comment-${post.id}`}
                      bind:value={post.comment_state.composerValue}
                      rows="2"
                      maxlength="500"
                      placeholder="Escribe un comentario..."
                      disabled={post.comment_state.submitPending}
                      class="w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    ></textarea>
                    <div class="flex items-center justify-between gap-3">
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        {post.comment_state.composerValue.trim().length}/500 caracteres
                      </p>
                      <button
                        type="button"
                        on:click={() => createComment(post.id)}
                        disabled={post.comment_state.submitPending || !post.comment_state.composerValue.trim()}
                        class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {#if post.comment_state.submitPending}Enviando...{:else}Comentar{/if}
                      </button>
                    </div>
                  </div>

                  {#if post.comment_state.error}
                    <p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      {post.comment_state.error}
                    </p>
                  {/if}

                  <div class="mt-4 space-y-3">
                    {#if post.comment_state.isLoading}
                      <p class="text-sm text-gray-500 dark:text-gray-400">Cargando comentarios...</p>
                    {:else if post.comment_state.hasLoaded && post.comment_state.items.length === 0}
                      <p class="text-sm text-gray-500 dark:text-gray-400">Aún no hay comentarios. Sé la primera persona en comentar.</p>
                    {:else}
                      {#each post.comment_state.items as comment (comment.id)}
                        <article class="rounded-lg bg-white p-3 shadow-sm dark:bg-gray-800">
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                              <div class="flex flex-wrap items-center gap-2">
                                <span class="text-sm font-semibold text-gray-900 dark:text-white">
                                  {comment.profile?.display_name || comment.profile?.username || 'Usuario'}
                                </span>
                                <span class="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(comment.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <p class="mt-2 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{comment.content}</p>
                            </div>

                            {#if comment.user_id === $auth.user?.id}
                              <button
                                type="button"
                                on:click={() => deleteComment(post.id, comment.id)}
                                disabled={comment.delete_pending}
                                class="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
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
      {/each}
    </div>
  {/if}
</div>

<ReportModal
  open={reportModalOpen}
  reporterId={$auth.user?.id ?? null}
  target={reportTarget}
  on:close={closeReportModal}
  on:submitted={handleReportSubmitted}
/>
