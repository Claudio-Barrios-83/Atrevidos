import { describe, expect, it } from 'vitest';
import {
  buildHomepageFeedQuery,
  isHomepagePublicFeedRow,
  normalizeHomepageFeedPost,
  parseHomepagePublicFeedRows,
  removeHomepageFeedPostsByUser
} from './feed';

type QueryStep =
  | { method: 'from'; args: [string] }
  | { method: 'select'; args: [string] }
  | { method: 'order'; args: [string, { ascending: boolean }] }
  | { method: 'limit'; args: [number] };

function createFeedQueryRecorder() {
  const steps: QueryStep[] = [];

  const builder = {
    select(selection: string) {
      steps.push({ method: 'select', args: [selection] });
      return builder;
    },
    order(column: string, options: { ascending: boolean }) {
      steps.push({ method: 'order', args: [column, options] });
      return builder;
    },
    limit(value: number) {
      steps.push({ method: 'limit', args: [value] });
      return builder;
    }
  };

  const client = {
    from(table: string) {
      steps.push({ method: 'from', args: [table] });
      return builder;
    }
  };

  return { client, steps };
}

describe('buildHomepageFeedQuery', () => {
  it('reads the homepage feed from public_feed with newest-first ordering and the flattened profile fields', () => {
    const { client, steps } = createFeedQueryRecorder();

    buildHomepageFeedQuery(client, 20);

    expect(steps).toEqual([
      { method: 'from', args: ['public_feed'] },
      {
        method: 'select',
        args: [[
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
        ].join(', ')]
      },
      { method: 'order', args: ['created_at', { ascending: false }] },
      { method: 'limit', args: [20] }
    ]);
  });
});

describe('normalizeHomepageFeedPost', () => {
  it('converts a public_feed row into the existing UI shape without losing profile or image data', () => {
    expect(
      normalizeHomepageFeedPost({
        id: 'post-1',
        user_id: 'user-1',
        content: 'Hola mundo',
        created_at: '2026-06-05T12:00:00.000Z',
        like_count: 5,
        comment_count: 2,
        image_urls: ['uploads/post-1/image-1.jpg'],
        username: 'alex',
        display_name: 'Alex',
        avatar_url: 'avatars/alex.jpg'
      })
    ).toMatchObject({
      id: 'post-1',
      user_id: 'user-1',
      content: 'Hola mundo',
      created_at: '2026-06-05T12:00:00.000Z',
      like_count: 5,
      comment_count: 2,
      image_urls: ['uploads/post-1/image-1.jpg'],
      profile: {
        username: 'alex',
        display_name: 'Alex',
        avatar_url: 'avatars/alex.jpg'
      },
      viewer_has_liked: false,
      like_pending: false
    });

    expect(normalizeHomepageFeedPost({
      id: 'post-1',
      user_id: 'user-1',
      content: 'Hola mundo',
      created_at: '2026-06-05T12:00:00.000Z',
      like_count: 5,
      comment_count: 2,
      image_urls: ['uploads/post-1/image-1.jpg'],
      username: 'alex',
      display_name: 'Alex',
      avatar_url: 'avatars/alex.jpg'
    }).comment_state).toEqual({
      isOpen: false,
      isLoading: false,
      hasLoaded: false,
      error: '',
      composerValue: '',
      submitPending: false,
      items: []
    });
  });

  it('keeps the profile nullable and normalizes null image arrays to an empty list', () => {
    expect(
      normalizeHomepageFeedPost({
        id: 'post-2',
        user_id: 'user-2',
        content: '',
        created_at: '2026-06-05T13:00:00.000Z',
        like_count: 0,
        comment_count: 0,
        image_urls: null,
        username: '',
        display_name: null,
        avatar_url: null
      })
    ).toMatchObject({
      id: 'post-2',
      image_urls: [],
      profile: null
    });
  });
});

describe('public_feed row validation', () => {
  it('accepts rows that match the homepage public feed contract', () => {
    expect(
      isHomepagePublicFeedRow({
        id: 'post-1',
        user_id: 'user-1',
        content: 'Hola mundo',
        created_at: '2026-06-05T12:00:00.000Z',
        like_count: 5,
        comment_count: 2,
        image_urls: ['uploads/post-1/image-1.jpg'],
        username: 'alex',
        display_name: 'Alex',
        avatar_url: 'avatars/alex.jpg'
      })
    ).toBe(true);
  });

  it('rejects malformed rows and parseHomepagePublicFeedRows surfaces the failing entry', () => {
    expect(
      isHomepagePublicFeedRow({
        id: 'post-1',
        user_id: 'user-1',
        content: 'Hola mundo',
        created_at: '2026-06-05T12:00:00.000Z',
        like_count: '5',
        comment_count: 2,
        image_urls: ['uploads/post-1/image-1.jpg'],
        username: 'alex',
        display_name: 'Alex',
        avatar_url: 'avatars/alex.jpg'
      })
    ).toBe(false);

    expect(() =>
      parseHomepagePublicFeedRows([
        {
          id: 'post-1',
          user_id: 'user-1',
          content: 'Hola mundo',
          created_at: '2026-06-05T12:00:00.000Z',
          like_count: 5,
          comment_count: 2,
          image_urls: ['uploads/post-1/image-1.jpg'],
          username: 'alex',
          display_name: 'Alex',
          avatar_url: 'avatars/alex.jpg'
        },
        {
          id: 'post-2',
          user_id: 'user-2',
          content: 'fila rota',
          created_at: '2026-06-05T13:00:00.000Z',
          like_count: 'bad-count',
          comment_count: 0,
          image_urls: null,
          username: 'bea',
          display_name: null,
          avatar_url: null
        }
      ])
    ).toThrow('La fila 2 del feed público no tiene el formato esperado.');
  });
});

describe('removeHomepageFeedPostsByUser', () => {
  it('removes every post authored by the blocked user and keeps the rest of the feed untouched', () => {
    const blockedAuthorPosts = [
      normalizeHomepageFeedPost({
        id: 'post-a',
        user_id: 'blocked-user',
        content: 'Uno',
        created_at: '2026-06-05T12:00:00.000Z',
        like_count: 0,
        comment_count: 0,
        image_urls: null,
        username: 'blocked',
        display_name: 'Blocked',
        avatar_url: null
      }),
      normalizeHomepageFeedPost({
        id: 'post-b',
        user_id: 'blocked-user',
        content: 'Dos',
        created_at: '2026-06-05T13:00:00.000Z',
        like_count: 0,
        comment_count: 0,
        image_urls: null,
        username: 'blocked',
        display_name: 'Blocked',
        avatar_url: null
      })
    ];

    const visiblePost = normalizeHomepageFeedPost({
      id: 'post-c',
      user_id: 'visible-user',
      content: 'Sigo aquí',
      created_at: '2026-06-05T14:00:00.000Z',
      like_count: 1,
      comment_count: 2,
      image_urls: null,
      username: 'visible',
      display_name: 'Visible',
      avatar_url: null
    });

    expect(removeHomepageFeedPostsByUser([...blockedAuthorPosts, visiblePost], 'blocked-user')).toEqual([visiblePost]);
  });
});
