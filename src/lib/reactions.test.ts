import { describe, expect, it } from 'vitest';
import {
  beginPostMutation,
  buildLikeInsert,
  collectCurrentUserLikedPostIds,
  hasCurrentUserLike,
  hydrateFeedPostReactions,
  invalidatePostMutation,
  isLatestPostMutation,
  togglePostLikeOptimistically,
  type FeedLikeRow
} from './reactions';

const likeRow = (overrides: Partial<FeedLikeRow> = {}): FeedLikeRow => ({
  id: 'like-1',
  post_id: 'post-1',
  user_id: 'user-1',
  reaction_type: 'like',
  created_at: '2026-06-05T06:00:00.000Z',
  ...overrides
});

describe('hasCurrentUserLike', () => {
  it('returns true when the feed row includes a like for the current user', () => {
    expect(hasCurrentUserLike([likeRow()], 'user-1')).toBe(true);
  });

  it('returns false when the relation is empty or belongs to another user', () => {
    expect(hasCurrentUserLike([], 'user-1')).toBe(false);
    expect(hasCurrentUserLike([likeRow({ user_id: 'user-2' })], 'user-1')).toBe(false);
    expect(hasCurrentUserLike(null, 'user-1')).toBe(false);
  });
});

describe('collectCurrentUserLikedPostIds', () => {
  it('builds a post-id lookup for current-user likes only', () => {
    expect(
      collectCurrentUserLikedPostIds(
        [
          likeRow(),
          likeRow({ id: 'like-2', post_id: 'post-2', reaction_type: 'love' }),
          likeRow({ id: 'like-3', post_id: 'post-3', user_id: 'user-2' })
        ],
        'user-1'
      )
    ).toEqual(new Set(['post-1']));
  });
});

describe('togglePostLikeOptimistically', () => {
  it('increments the count and marks the post liked when the user likes it', () => {
    expect(
      togglePostLikeOptimistically({
        id: 'post-1',
        like_count: 2,
        viewer_has_liked: false,
        like_pending: false
      })
    ).toMatchObject({
      like_count: 3,
      viewer_has_liked: true,
      like_pending: true
    });
  });

  it('decrements the count without going below zero when the user unlikes it', () => {
    expect(
      togglePostLikeOptimistically({
        id: 'post-1',
        like_count: 1,
        viewer_has_liked: true,
        like_pending: false
      })
    ).toMatchObject({
      like_count: 0,
      viewer_has_liked: false,
      like_pending: true
    });

    expect(
      togglePostLikeOptimistically({
        id: 'post-2',
        like_count: 0,
        viewer_has_liked: true,
        like_pending: false
      })
    ).toMatchObject({
      like_count: 0,
      viewer_has_liked: false,
      like_pending: true
    });
  });

  it('treats null counts as zero for optimistic like toggles', () => {
    expect(
      togglePostLikeOptimistically({
        id: 'post-3',
        like_count: null,
        viewer_has_liked: false,
        like_pending: false
      })
    ).toMatchObject({
      like_count: 1,
      viewer_has_liked: true,
      like_pending: true
    });

    expect(
      togglePostLikeOptimistically({
        id: 'post-4',
        like_count: null,
        viewer_has_liked: true,
        like_pending: false
      })
    ).toMatchObject({
      like_count: 0,
      viewer_has_liked: false,
      like_pending: true
    });
  });
});

describe('hydrateFeedPostReactions', () => {
  it('hydrates viewer likes from a lookup set and clears pending state', () => {
    expect(
      hydrateFeedPostReactions(
        [
          { id: 'post-1', like_count: 2, viewer_has_liked: false, like_pending: true },
          { id: 'post-2', like_count: 0, viewer_has_liked: true, like_pending: true }
        ],
        new Set(['post-2'])
      )
    ).toEqual([
      { id: 'post-1', like_count: 2, viewer_has_liked: false, like_pending: false },
      { id: 'post-2', like_count: 0, viewer_has_liked: true, like_pending: false }
    ]);
  });
});

describe('post mutation guards', () => {
  it('marks older completions stale after a newer mutation starts', () => {
    const mutations = new Map<string, number>();
    const firstToken = beginPostMutation(mutations, 'post-1');
    const secondToken = beginPostMutation(mutations, 'post-1');

    expect(isLatestPostMutation(mutations, 'post-1', firstToken)).toBe(false);
    expect(isLatestPostMutation(mutations, 'post-1', secondToken)).toBe(true);
  });

  it('marks in-flight completions stale after server hydration invalidates the post version', () => {
    const mutations = new Map<string, number>();
    const token = beginPostMutation(mutations, 'post-1');

    invalidatePostMutation(mutations, 'post-1');

    expect(isLatestPostMutation(mutations, 'post-1', token)).toBe(false);
  });
});

describe('buildLikeInsert', () => {
  it('builds the MVP like payload for Supabase inserts', () => {
    expect(buildLikeInsert('user-1', 'post-9')).toEqual({
      user_id: 'user-1',
      post_id: 'post-9',
      reaction_type: 'like'
    });
  });
});
