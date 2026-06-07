import type { Database } from '$lib/database.types';

export type FeedLikeRow = Pick<
  Database['public']['Tables']['likes']['Row'],
  'id' | 'post_id' | 'user_id' | 'reaction_type' | 'created_at'
>;

export type FeedReactionState = {
  id: string;
  like_count: number | null;
  viewer_has_liked: boolean;
  like_pending: boolean;
};

export type PostMutationVersions = Map<string, number>;

export function hasCurrentUserLike(likes: FeedLikeRow[] | null | undefined, userId: string) {
  return (likes ?? []).some((like) => like.user_id === userId && like.reaction_type === 'like');
}

export function collectCurrentUserLikedPostIds(
  likes: FeedLikeRow[] | null | undefined,
  userId: string
): ReadonlySet<string> {
  const likedPostIds = new Set<string>();

  for (const like of likes ?? []) {
    if (like.user_id === userId && like.reaction_type === 'like') {
      likedPostIds.add(like.post_id);
    }
  }

  return likedPostIds;
}

export function hydrateFeedPostReactions<T extends FeedReactionState>(
  posts: T[],
  likedPostIds: ReadonlySet<string>
): T[] {
  return posts.map((post) => ({
    ...post,
    viewer_has_liked: likedPostIds.has(post.id),
    like_pending: false
  }));
}

export function togglePostLikeOptimistically<T extends FeedReactionState>(post: T): T {
  const currentCount = Math.max(post.like_count ?? 0, 0);
  const viewerHasLiked = !post.viewer_has_liked;
  const likeCount = viewerHasLiked ? currentCount + 1 : Math.max(currentCount - 1, 0);

  return {
    ...post,
    like_count: likeCount,
    viewer_has_liked: viewerHasLiked,
    like_pending: true
  };
}

function getNextPostMutationVersion(mutations: PostMutationVersions, postId: string) {
  return (mutations.get(postId) ?? 0) + 1;
}

export function beginPostMutation(mutations: PostMutationVersions, postId: string) {
  const version = getNextPostMutationVersion(mutations, postId);
  mutations.set(postId, version);
  return version;
}

export function invalidatePostMutation(mutations: PostMutationVersions, postId: string) {
  return beginPostMutation(mutations, postId);
}

export function isLatestPostMutation(mutations: PostMutationVersions, postId: string, version: number) {
  return (mutations.get(postId) ?? 0) === version;
}

export function buildLikeInsert(userId: string, postId: string): Database['public']['Tables']['likes']['Insert'] {
  return {
    user_id: userId,
    post_id: postId,
    reaction_type: 'like'
  };
}
