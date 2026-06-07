import type { Database } from '$lib/database.types';

type ProfileSummary = Pick<Database['public']['Tables']['profiles']['Row'], 'username' | 'avatar_url' | 'display_name'>;

type CommentRow = Database['public']['Tables']['comments']['Row'];

export type RawFeedComment = CommentRow & {
  profiles: ProfileSummary | ProfileSummary[] | null;
};

export type FeedComment = CommentRow & {
  profile: ProfileSummary | null;
  delete_pending: boolean;
};

export type FeedCommentState = {
  isOpen: boolean;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string;
  composerValue: string;
  submitPending: boolean;
  items: FeedComment[];
};

export type FeedCommentPostState = {
  id: string;
  comment_count: number | null;
  comment_state: FeedCommentState;
};

export type CommentLoadVersions = Map<string, number>;

type CommentLoadContext = {
  requestUserId: string;
  currentAuthUserId: string | null | undefined;
  activeUserId: string | null;
};

function compareCreatedAtAscending(a: FeedComment, b: FeedComment) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function getNextCommentLoadVersion(versions: CommentLoadVersions, postId: string) {
  return (versions.get(postId) ?? 0) + 1;
}

export function createInitialCommentState(): FeedCommentState {
  return {
    isOpen: false,
    isLoading: false,
    hasLoaded: false,
    error: '',
    composerValue: '',
    submitPending: false,
    items: []
  };
}

export function toggleCommentThread(state: FeedCommentState): FeedCommentState {
  return {
    ...state,
    isOpen: !state.isOpen
  };
}

export function beginCommentLoad(versions: CommentLoadVersions, postId: string) {
  const version = getNextCommentLoadVersion(versions, postId);
  versions.set(postId, version);
  return version;
}

export function invalidateCommentLoad(versions: CommentLoadVersions, postId: string) {
  return beginCommentLoad(versions, postId);
}

export function isLatestCommentLoad(versions: CommentLoadVersions, postId: string, version: number) {
  return (versions.get(postId) ?? 0) === version;
}

export function isCurrentCommentLoadContext({
  requestUserId,
  currentAuthUserId,
  activeUserId
}: CommentLoadContext) {
  return currentAuthUserId === requestUserId && activeUserId === requestUserId;
}

export function normalizeFeedComments(comments: RawFeedComment[]): FeedComment[] {
  return comments
    .filter((comment) => !comment.is_hidden)
    .map((comment) => {
      const { profiles, ...commentRow } = comment;

      return {
        ...commentRow,
        profile: Array.isArray(profiles) ? (profiles[0] ?? null) : profiles,
        delete_pending: false
      };
    })
    .sort(compareCreatedAtAscending);
}

export function buildCommentInsert(
  userId: string,
  postId: string,
  content: string
): Database['public']['Tables']['comments']['Insert'] {
  return {
    user_id: userId,
    post_id: postId,
    parent_comment_id: null,
    content: content.trim()
  };
}

export function applyCreatedComment<T extends FeedCommentPostState>(post: T, createdComment: FeedComment): T {
  const currentCount = Math.max(post.comment_count ?? 0, 0);

  return {
    ...post,
    comment_count: currentCount + 1,
    comment_state: {
      ...post.comment_state,
      error: '',
      isLoading: false,
      submitPending: false,
      composerValue: '',
      hasLoaded: true,
      items: [...post.comment_state.items, createdComment].sort(compareCreatedAtAscending)
    }
  };
}

export function applyDeletedComment<T extends FeedCommentPostState>(post: T, commentId: string): T {
  const nextItems = post.comment_state.items.filter((comment) => comment.id !== commentId);
  const removedCount = nextItems.length === post.comment_state.items.length ? 0 : 1;

  return {
    ...post,
    comment_count: Math.max((post.comment_count ?? 0) - removedCount, 0),
    comment_state: {
      ...post.comment_state,
      error: '',
      isLoading: false,
      items: nextItems
    }
  };
}

export function toCommentActionErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';
  const message = rawMessage.toLowerCase();

  if (
    message.includes('check constraint') ||
    message.includes('violates check constraint') ||
    message.includes('empty')
  ) {
    return 'Escribe un comentario antes de enviarlo.';
  }

  return 'No pudimos guardar tu comentario. Inténtalo de nuevo.';
}
