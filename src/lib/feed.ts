import { createInitialCommentState, type FeedCommentState } from '$lib/comments';
import type { Database } from '$lib/database.types';

type ProfileSummary = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'username' | 'avatar_url' | 'display_name'
>;

type FeedPostRow = Pick<
  Database['public']['Tables']['posts']['Row'],
  'id' | 'user_id' | 'content' | 'created_at' | 'like_count' | 'comment_count' | 'image_urls'
>;

export type HomepageFeedPost = FeedPostRow & {
  profile: ProfileSummary | null;
  viewer_has_liked: boolean;
  like_pending: boolean;
  image_urls: string[];
  comment_state: FeedCommentState;
};

export type HomepagePublicFeedRow = FeedPostRow & ProfileSummary;

export const HOMEPAGE_PUBLIC_FEED_SELECT = [
  'id',
  'user_id',
  'content',
  'created_at',
  'like_count',
  'comment_count',
  'image_urls',
  'username',
  'display_name',
  'avatar_url'
].join(', ');

export function buildHomepageFeedQuery<TClient extends { from(table: string): any }>(client: TClient, pageSize: number) {
  return client
    .from('public_feed')
    .select(HOMEPAGE_PUBLIC_FEED_SELECT)
    .order('created_at', { ascending: false })
    .limit(pageSize);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function isHomepagePublicFeedRow(value: unknown): value is HomepagePublicFeedRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Record<string, unknown>;

  return (
    typeof row.id === 'string' &&
    typeof row.user_id === 'string' &&
    typeof row.content === 'string' &&
    typeof row.created_at === 'string' &&
    typeof row.like_count === 'number' &&
    typeof row.comment_count === 'number' &&
    (row.image_urls === null || isStringArray(row.image_urls)) &&
    typeof row.username === 'string' &&
    (row.display_name === null || typeof row.display_name === 'string') &&
    (row.avatar_url === null || typeof row.avatar_url === 'string')
  );
}

export function parseHomepagePublicFeedRows(rows: unknown): HomepagePublicFeedRow[] {
  if (!Array.isArray(rows)) {
    throw new Error('La respuesta del feed no llegó en formato de lista.');
  }

  return rows.map((row, index) => {
    if (!isHomepagePublicFeedRow(row)) {
      throw new Error(`La fila ${index + 1} del feed público no tiene el formato esperado.`);
    }

    return row;
  });
}

export function normalizeHomepageFeedPost(post: HomepagePublicFeedRow): HomepageFeedPost {
  const profile = post.username || post.display_name || post.avatar_url
    ? {
        username: post.username,
        display_name: post.display_name,
        avatar_url: post.avatar_url
      }
    : null;

  return {
    id: post.id,
    user_id: post.user_id,
    content: post.content,
    created_at: post.created_at,
    like_count: post.like_count,
    comment_count: post.comment_count,
    image_urls: post.image_urls ?? [],
    profile,
    viewer_has_liked: false,
    like_pending: false,
    comment_state: createInitialCommentState()
  };
}

export function removeHomepageFeedPostsByUser(posts: HomepageFeedPost[], blockedUserId: string) {
  return posts.filter((post) => post.user_id !== blockedUserId);
}
