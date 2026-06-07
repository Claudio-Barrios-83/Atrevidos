import { describe, expect, it } from 'vitest';
import {
  applyCreatedComment,
  applyDeletedComment,
  beginCommentLoad,
  buildCommentInsert,
  createInitialCommentState,
  invalidateCommentLoad,
  isCurrentCommentLoadContext,
  isLatestCommentLoad,
  normalizeFeedComments,
  toCommentActionErrorMessage,
  toggleCommentThread,
  type FeedComment,
  type RawFeedComment
} from './comments';

const rawComment = (overrides: Partial<RawFeedComment> = {}): RawFeedComment => ({
  id: 'comment-1',
  user_id: 'user-1',
  post_id: 'post-1',
  parent_comment_id: null,
  content: 'Hola',
  is_edited: false,
  like_count: 0,
  is_hidden: false,
  created_at: '2026-06-05T06:00:00.000Z',
  updated_at: '2026-06-05T06:00:00.000Z',
  profiles: {
    username: 'atrevida',
    avatar_url: null,
    display_name: 'Atrevida'
  },
  ...overrides
});

const comment = (overrides: Partial<FeedComment> = {}): FeedComment => ({
  id: 'comment-1',
  user_id: 'user-1',
  post_id: 'post-1',
  parent_comment_id: null,
  content: 'Hola',
  is_edited: false,
  like_count: 0,
  is_hidden: false,
  created_at: '2026-06-05T06:00:00.000Z',
  updated_at: '2026-06-05T06:00:00.000Z',
  profile: {
    username: 'atrevida',
    avatar_url: null,
    display_name: 'Atrevida'
  },
  delete_pending: false,
  ...overrides
});

describe('normalizeFeedComments', () => {
  it('flattens profile relations and sorts comments by creation time', () => {
    expect(
      normalizeFeedComments([
        rawComment({
          id: 'comment-2',
          created_at: '2026-06-05T07:00:00.000Z',
          profiles: [{ username: 'dos', avatar_url: null, display_name: 'Dos' }]
        }),
        rawComment({
          id: 'comment-1',
          created_at: '2026-06-05T06:00:00.000Z'
        })
      ])
    ).toEqual([
      comment({ id: 'comment-1' }),
      comment({
        id: 'comment-2',
        created_at: '2026-06-05T07:00:00.000Z',
        updated_at: '2026-06-05T06:00:00.000Z',
        profile: { username: 'dos', avatar_url: null, display_name: 'Dos' }
      })
    ]);
  });

  it('drops hidden comments and handles missing profile joins', () => {
    expect(
      normalizeFeedComments([
        rawComment({ id: 'hidden', is_hidden: true }),
        rawComment({ id: 'visible', profiles: null })
      ])
    ).toEqual([comment({ id: 'visible', profile: null })]);
  });
});

describe('comment thread state helpers', () => {
  it('creates a closed initial state and toggles without losing loaded data', () => {
    const initial = createInitialCommentState();

    expect(initial).toEqual({
      isOpen: false,
      isLoading: false,
      hasLoaded: false,
      error: '',
      composerValue: '',
      submitPending: false,
      items: []
    });

    expect(toggleCommentThread(initial)).toMatchObject({ isOpen: true });
    expect(toggleCommentThread({ ...initial, isOpen: true, hasLoaded: true })).toMatchObject({
      isOpen: false,
      hasLoaded: true
    });
  });
});

describe('comment load guards', () => {
  it('marks older comment loads stale after a newer load starts for the same post', () => {
    const versions = new Map<string, number>();
    const firstToken = beginCommentLoad(versions, 'post-1');
    const secondToken = beginCommentLoad(versions, 'post-1');

    expect(isLatestCommentLoad(versions, 'post-1', firstToken)).toBe(false);
    expect(isLatestCommentLoad(versions, 'post-1', secondToken)).toBe(true);
  });

  it('marks in-flight comment loads stale after a local mutation invalidates the post version', () => {
    const versions = new Map<string, number>();
    const token = beginCommentLoad(versions, 'post-1');

    invalidateCommentLoad(versions, 'post-1');

    expect(isLatestCommentLoad(versions, 'post-1', token)).toBe(false);
  });

  it('requires the same auth/session context before applying a comment load result', () => {
    expect(
      isCurrentCommentLoadContext({
        requestUserId: 'user-1',
        currentAuthUserId: 'user-1',
        activeUserId: 'user-1'
      })
    ).toBe(true);

    expect(
      isCurrentCommentLoadContext({
        requestUserId: 'user-1',
        currentAuthUserId: null,
        activeUserId: 'user-1'
      })
    ).toBe(false);

    expect(
      isCurrentCommentLoadContext({
        requestUserId: 'user-1',
        currentAuthUserId: 'user-2',
        activeUserId: 'user-1'
      })
    ).toBe(false);

    expect(
      isCurrentCommentLoadContext({
        requestUserId: 'user-1',
        currentAuthUserId: 'user-1',
        activeUserId: 'user-2'
      })
    ).toBe(false);
  });
});

describe('applyCreatedComment', () => {
  it('appends the created comment, clears composer state, and increments the count', () => {
    expect(
      applyCreatedComment(
        {
          id: 'post-1',
          comment_count: 1,
          comment_state: {
            ...createInitialCommentState(),
            isOpen: true,
            hasLoaded: true,
            submitPending: true,
            composerValue: 'Nuevo comentario',
            items: [comment()]
          }
        },
        comment({ id: 'comment-2', created_at: '2026-06-05T08:00:00.000Z' })
      )
    ).toMatchObject({
      comment_count: 2,
      comment_state: {
        isOpen: true,
        isLoading: false,
        hasLoaded: true,
        submitPending: false,
        composerValue: '',
        items: [comment(), comment({ id: 'comment-2', created_at: '2026-06-05T08:00:00.000Z' })]
      }
    });
  });
});

describe('applyDeletedComment', () => {
  it('removes the deleted comment and decrements the count without going below zero', () => {
    expect(
      applyDeletedComment(
        {
          id: 'post-1',
          comment_count: 2,
          comment_state: {
            ...createInitialCommentState(),
            hasLoaded: true,
            items: [comment(), comment({ id: 'comment-2' })]
          }
        },
        'comment-1'
      )
    ).toMatchObject({
      comment_count: 1,
      comment_state: {
        isLoading: false,
        items: [comment({ id: 'comment-2' })]
      }
    });

    expect(
      applyDeletedComment(
        {
          id: 'post-2',
          comment_count: 0,
          comment_state: {
            ...createInitialCommentState(),
            hasLoaded: true,
            items: [comment()]
          }
        },
        'missing'
      )
    ).toMatchObject({
      comment_count: 0,
      comment_state: {
        isLoading: false,
        items: [comment()]
      }
    });
  });
});

describe('buildCommentInsert', () => {
  it('builds a flat comment payload with trimmed content', () => {
    expect(buildCommentInsert('user-1', 'post-9', '  Hola mundo  ')).toEqual({
      user_id: 'user-1',
      post_id: 'post-9',
      parent_comment_id: null,
      content: 'Hola mundo'
    });
  });
});

describe('toCommentActionErrorMessage', () => {
  it('maps duplicate/inappropriate empty errors to friendly messages', () => {
    expect(toCommentActionErrorMessage(new Error('duplicate key value'))).toBe(
      'No pudimos guardar tu comentario. Inténtalo de nuevo.'
    );
    expect(toCommentActionErrorMessage(new Error('new row violates check constraint'))).toBe(
      'Escribe un comentario antes de enviarlo.'
    );
  });
});
