import { describe, expect, it } from 'vitest';
import {
  buildMatchListItems,
  collectBlockedMatchUserIds,
  indexConversationIdsByMatchedUser,
  removeMatchListItemsByUser,
  type ConversationParticipantRow,
  type ConversationRow,
  type MatchListItem,
  type MatchVisibilityRow,
  type MutualMatchRow,
  type MutualMatchProfile
} from './matches';

const baseProfile = (overrides: Partial<MutualMatchProfile> = {}): MutualMatchProfile => ({
  id: 'profile-1',
  username: 'alex',
  display_name: 'Alex',
  avatar_url: null,
  location: 'Madrid',
  interests: ['Música'],
  relationship_intent: 'amistad',
  ...overrides
});

const baseRow = (overrides: Partial<MutualMatchRow> = {}): MutualMatchRow => ({
  id: 'match-1',
  target_user_id: 'profile-1',
  match_type: 'like',
  created_at: '2026-06-05T00:00:00.000Z',
  target_profile: baseProfile(),
  ...overrides
});

describe('buildMatchListItems', () => {
  it('builds UI-ready match cards from mutual match rows', () => {
    const items = buildMatchListItems([
      baseRow({
        target_profile: baseProfile({
          id: 'profile-2',
          username: 'bea',
          display_name: 'Bea',
          location: 'Bogotá',
          interests: ['Arte', 'Café'],
          relationship_intent: 'citas'
        }),
        target_user_id: 'profile-2'
      })
    ]);

    expect(items).toEqual<MatchListItem[]>([
      {
        id: 'match-1',
        matchedUserId: 'profile-2',
        username: 'bea',
        displayName: 'Bea',
        avatarUrl: null,
        location: 'Bogotá',
        interests: ['Arte', 'Café'],
        relationshipIntent: 'citas',
        matchedAt: '2026-06-05T00:00:00.000Z'
      }
    ]);
  });

  it('deduplicates repeated rows for the same matched user and keeps the newest match row', () => {
    const items = buildMatchListItems([
      baseRow({ id: 'older', created_at: '2026-06-04T00:00:00.000Z' }),
      baseRow({ id: 'newer', created_at: '2026-06-05T00:00:00.000Z' })
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('newer');
    expect(items[0]?.matchedAt).toBe('2026-06-05T00:00:00.000Z');
  });

  it('supports Supabase join rows where the matched profile arrives as an array', () => {
    const items = buildMatchListItems([
      baseRow({
        target_profile: [baseProfile({ id: 'profile-array', username: 'sam', display_name: 'Sam' })]
      })
    ]);

    expect(items[0]).toMatchObject({
      matchedUserId: 'profile-1',
      username: 'sam',
      displayName: 'Sam'
    });
  });

  it('skips rows that do not contain a usable matched profile', () => {
    const items = buildMatchListItems([
      baseRow({ id: 'missing-profile', target_profile: null }),
      baseRow({ id: 'present-profile' })
    ]);

    expect(items.map((item) => item.id)).toEqual(['present-profile']);
  });

  it('excludes blocked users from the final match list and prefers valid timestamps over malformed ones', () => {
    const items = buildMatchListItems(
      [
        baseRow({ id: 'valid', created_at: '2026-06-05T00:00:00.000Z', target_user_id: 'visible-user' }),
        baseRow({ id: 'invalid', created_at: 'not-a-date', target_user_id: 'visible-user' }),
        baseRow({ id: 'blocked', target_user_id: 'blocked-user' })
      ],
      new Set(['blocked-user'])
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('valid');
    expect(items[0]?.matchedUserId).toBe('visible-user');
  });

  it('sorts valid timestamps ahead of malformed ones across different matched users', () => {
    const items = buildMatchListItems([
      baseRow({
        id: 'invalid-other-user',
        created_at: 'not-a-date',
        target_user_id: 'profile-invalid',
        target_profile: baseProfile({ id: 'profile-invalid', username: 'invalid', display_name: 'Invalid date' })
      }),
      baseRow({
        id: 'recent-valid',
        created_at: '2026-06-06T00:00:00.000Z',
        target_user_id: 'profile-valid',
        target_profile: baseProfile({ id: 'profile-valid', username: 'valid', display_name: 'Valid date' })
      })
    ]);

    expect(items.map((item) => item.id)).toEqual(['recent-valid', 'invalid-other-user']);
  });
});

describe('collectBlockedMatchUserIds', () => {
  it('collects both users blocked by me and users who blocked me', () => {
    const rows: MatchVisibilityRow[] = [
      { user_id: 'me', target_user_id: 'blocked-by-me', match_type: 'block' },
      { user_id: 'blocked-me', target_user_id: 'me', match_type: 'block' },
      { user_id: 'me', target_user_id: 'liked-user', match_type: 'like' }
    ];

    expect(Array.from(collectBlockedMatchUserIds(rows, 'me')).sort()).toEqual([
      'blocked-by-me',
      'blocked-me'
    ]);
  });
});

describe('indexConversationIdsByMatchedUser', () => {
  it('returns only direct, accessible conversations that include two active participants', () => {
    const participants: ConversationParticipantRow[] = [
      { conversation_id: 'direct-a', user_id: 'me', is_active: true },
      { conversation_id: 'direct-a', user_id: 'match-a', is_active: true },
      { conversation_id: 'group-a', user_id: 'me', is_active: true },
      { conversation_id: 'group-a', user_id: 'match-b', is_active: true },
      { conversation_id: 'group-a', user_id: 'third-user', is_active: true },
      { conversation_id: 'missing-me', user_id: 'match-c', is_active: true },
      { conversation_id: 'inactive-me', user_id: 'me', is_active: false },
      { conversation_id: 'inactive-me', user_id: 'match-d', is_active: true },
      { conversation_id: 'inactive-match', user_id: 'me', is_active: true },
      { conversation_id: 'inactive-match', user_id: 'match-e', is_active: false }
    ];

    const conversations: ConversationRow[] = [
      { id: 'direct-a', is_group: false },
      { id: 'group-a', is_group: true },
      { id: 'missing-me', is_group: false },
      { id: 'inactive-me', is_group: false },
      { id: 'inactive-match', is_group: false }
    ];

    expect(
      indexConversationIdsByMatchedUser(
        'me',
        ['match-a', 'match-b', 'match-c', 'match-d', 'match-e'],
        participants,
        conversations
      )
    ).toEqual({
      'match-a': 'direct-a'
    });
  });
});

describe('removeMatchListItemsByUser', () => {
  it('drops the blocked match from the current list without disturbing other cards', () => {
    const items: MatchListItem[] = [
      {
        id: 'match-1',
        matchedUserId: 'blocked-user',
        username: 'blocked',
        displayName: 'Blocked',
        avatarUrl: null,
        location: 'Madrid',
        interests: ['Café'],
        relationshipIntent: 'amistad',
        matchedAt: '2026-06-05T00:00:00.000Z'
      },
      {
        id: 'match-2',
        matchedUserId: 'visible-user',
        username: 'visible',
        displayName: 'Visible',
        avatarUrl: null,
        location: 'Bogotá',
        interests: ['Arte'],
        relationshipIntent: 'citas',
        matchedAt: '2026-06-06T00:00:00.000Z'
      }
    ];

    expect(removeMatchListItemsByUser(items, 'blocked-user')).toEqual([items[1]]);
  });
});
