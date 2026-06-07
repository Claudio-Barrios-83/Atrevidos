import { describe, expect, it } from 'vitest';
import {
  buildConversationListItems,
  finalizeConversationListItems,
  type ConversationListItem,
  type ConversationMatchRow,
  type ConversationParticipantProfile,
  type ConversationParticipantRow,
  type UserConversationRow
} from './conversations';

const baseConversation = (overrides: Partial<UserConversationRow> = {}): UserConversationRow => ({
  id: 'conversation-1',
  is_group: false,
  name: null,
  avatar_url: null,
  last_message_at: '2026-06-05T12:00:00.000Z',
  created_at: '2026-06-01T12:00:00.000Z',
  last_message_content: 'Hola, ¿cómo va todo?',
  last_message_time: '2026-06-05T12:00:00.000Z',
  last_message_sender: 'Alex',
  unread_count: 2,
  ...overrides
});

const baseProfile = (overrides: Partial<ConversationParticipantProfile> = {}): ConversationParticipantProfile => ({
  id: 'match-1',
  username: 'alex',
  display_name: 'Alex',
  avatar_url: null,
  ...overrides
});

const baseParticipant = (overrides: Partial<ConversationParticipantRow> = {}): ConversationParticipantRow => ({
  conversation_id: 'conversation-1',
  user_id: 'match-1',
  is_active: true,
  profile: baseProfile(),
  ...overrides
});

const mutualLike = (overrides: Partial<ConversationMatchRow> = {}): ConversationMatchRow => ({
  user_id: 'me',
  target_user_id: 'match-1',
  match_type: 'like',
  is_mutual: true,
  ...overrides
});

describe('buildConversationListItems', () => {
  it('builds inbox-ready items for direct conversations with matched users', () => {
    const items = buildConversationListItems(
      'me',
      [baseConversation()],
      [
        baseParticipant({
          user_id: 'me',
          profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' })
        }),
        baseParticipant()
      ],
      [mutualLike()]
    );

    expect(items).toEqual<ConversationListItem[]>([
      {
        conversationId: 'conversation-1',
        counterpartUserId: 'match-1',
        counterpartName: 'Alex',
        counterpartUsername: 'alex',
        counterpartAvatarUrl: null,
        hasConversation: true,
        lastActivityAt: '2026-06-05T12:00:00.000Z',
        lastMessagePreview: 'Hola, ¿cómo va todo?',
        lastMessageSenderName: 'Alex',
        unreadCount: 2
      }
    ]);
  });

  it('hides conversations for blocked users and non-mutual users', () => {
    const items = buildConversationListItems(
      'me',
      [
        baseConversation({ id: 'blocked-conversation' }),
        baseConversation({ id: 'non-mutual-conversation' }),
        baseConversation({ id: 'visible-conversation' })
      ],
      [
        baseParticipant({ conversation_id: 'blocked-conversation', user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'blocked-conversation', user_id: 'blocked-user', profile: baseProfile({ id: 'blocked-user', username: 'blocked', display_name: 'Blocked' }) }),
        baseParticipant({ conversation_id: 'non-mutual-conversation', user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'non-mutual-conversation', user_id: 'pending-user', profile: baseProfile({ id: 'pending-user', username: 'pending', display_name: 'Pending' }) }),
        baseParticipant({ conversation_id: 'visible-conversation', user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'visible-conversation', user_id: 'match-1', profile: baseProfile() })
      ],
      [
        mutualLike({ target_user_id: 'match-1' }),
        mutualLike({ user_id: 'me', target_user_id: 'blocked-user', match_type: 'block', is_mutual: false }),
        mutualLike({ user_id: 'me', target_user_id: 'pending-user', is_mutual: false })
      ]
    );

    expect(items.map((item) => item.conversationId)).toEqual(['visible-conversation']);
  });

  it('ignores group conversations, conversations with malformed participant sets, and rows without counterpart profiles', () => {
    const items = buildConversationListItems(
      'me',
      [
        baseConversation({ id: 'group-conversation', is_group: true }),
        baseConversation({ id: 'self-only-conversation' }),
        baseConversation({ id: 'missing-profile-conversation' }),
        baseConversation({ id: 'valid-conversation' })
      ],
      [
        baseParticipant({ conversation_id: 'self-only-conversation', user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'missing-profile-conversation', user_id: 'match-2', profile: null }),
        baseParticipant({ conversation_id: 'valid-conversation', user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'valid-conversation', user_id: 'match-1', profile: baseProfile() })
      ],
      [mutualLike()]
    );

    expect(items.map((item) => item.conversationId)).toEqual(['valid-conversation']);
  });

  it('ignores inactive historical participants when resolving a valid direct conversation', () => {
    const items = buildConversationListItems(
      'me',
      [baseConversation({ id: 'conversation-with-history' })],
      [
        baseParticipant({
          conversation_id: 'conversation-with-history',
          user_id: 'me',
          profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' })
        }),
        baseParticipant({
          conversation_id: 'conversation-with-history',
          user_id: 'match-1',
          profile: baseProfile({ id: 'match-1', username: 'alex', display_name: 'Alex' })
        }),
        baseParticipant({
          conversation_id: 'conversation-with-history',
          user_id: 'archived-user',
          is_active: false,
          profile: baseProfile({ id: 'archived-user', username: 'old', display_name: 'Old User' })
        })
      ],
      [mutualLike()]
    );

    expect(items).toEqual<ConversationListItem[]>([
      expect.objectContaining({
        conversationId: 'conversation-with-history',
        counterpartUserId: 'match-1',
        counterpartName: 'Alex'
      })
    ]);
  });

  it('requires exactly two active participants and an active participant row for the current user', () => {
    const items = buildConversationListItems(
      'me',
      [
        baseConversation({ id: 'missing-self' }),
        baseConversation({ id: 'inactive-self' }),
        baseConversation({ id: 'inactive-match' }),
        baseConversation({ id: 'valid-direct' })
      ],
      [
        baseParticipant({ conversation_id: 'missing-self', user_id: 'match-1', profile: baseProfile({ id: 'match-1', username: 'alex', display_name: 'Alex' }) }),
        baseParticipant({ conversation_id: 'inactive-self', user_id: 'me', is_active: false, profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'inactive-self', user_id: 'match-2', profile: baseProfile({ id: 'match-2', username: 'bea', display_name: 'Bea' }) }),
        baseParticipant({ conversation_id: 'inactive-match', user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'inactive-match', user_id: 'match-3', is_active: false, profile: baseProfile({ id: 'match-3', username: 'cam', display_name: 'Cam' }) }),
        baseParticipant({ conversation_id: 'valid-direct', user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'valid-direct', user_id: 'match-4', profile: baseProfile({ id: 'match-4', username: 'dee', display_name: 'Dee' }) })
      ],
      [
        mutualLike({ target_user_id: 'match-1' }),
        mutualLike({ target_user_id: 'match-2' }),
        mutualLike({ target_user_id: 'match-3' }),
        mutualLike({ target_user_id: 'match-4' })
      ]
    );

    expect(items.map((item) => item.conversationId)).toEqual(['valid-direct']);
  });

  it('falls back to conversation timestamps, normalizes malformed metadata, and sorts by newest valid activity first', () => {
    const items = buildConversationListItems(
      'me',
      [
        baseConversation({
          id: 'older-valid',
          last_message_time: null,
          last_message_at: '2026-06-04T10:00:00.000Z',
          created_at: '2026-06-01T12:00:00.000Z',
          last_message_content: null,
          unread_count: null
        }),
        baseConversation({
          id: 'newest-valid',
          last_message_time: '2026-06-06T09:00:00.000Z',
          unread_count: -4
        }),
        baseConversation({
          id: 'invalid-date',
          last_message_time: 'not-a-date',
          last_message_at: 'also-bad',
          created_at: 'still-bad'
        })
      ],
      [
        baseParticipant({ conversation_id: 'older-valid', user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'older-valid', user_id: 'older-user', profile: baseProfile({ id: 'older-user', username: 'older', display_name: 'Older' }) }),
        baseParticipant({ conversation_id: 'newest-valid', user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'newest-valid', user_id: 'new-user', profile: baseProfile({ id: 'new-user', username: 'newer', display_name: 'Newer' }) }),
        baseParticipant({ conversation_id: 'invalid-date', user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'invalid-date', user_id: 'invalid-user', profile: baseProfile({ id: 'invalid-user', username: 'invalid', display_name: 'Invalid' }) })
      ],
      [
        mutualLike({ target_user_id: 'older-user' }),
        mutualLike({ target_user_id: 'new-user' }),
        mutualLike({ target_user_id: 'invalid-user' })
      ]
    );

    expect(items.map((item) => item.conversationId)).toEqual(['newest-valid', 'older-valid', 'invalid-date']);
    expect(items[0]).toMatchObject({ unreadCount: 0, lastActivityAt: '2026-06-06T09:00:00.000Z' });
    expect(items[1]).toMatchObject({ lastMessagePreview: null, lastActivityAt: '2026-06-04T10:00:00.000Z' });
    expect(items[2]?.lastActivityAt).toBe(null);
  });

  it('supports Supabase joins where participant profiles arrive as arrays and uses username fallback for display names', () => {
    const items = buildConversationListItems(
      'me',
      [baseConversation({ id: 'array-profile-conversation' })],
      [
        baseParticipant({
          conversation_id: 'array-profile-conversation',
          user_id: 'me',
          profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' })
        }),
        baseParticipant({
          conversation_id: 'array-profile-conversation',
          user_id: 'array-user',
          profile: [baseProfile({ id: 'array-user', username: 'sam', display_name: null })]
        })
      ],
      [mutualLike({ target_user_id: 'array-user' })]
    );

    expect(items).toEqual<ConversationListItem[]>([
      expect.objectContaining({
        conversationId: 'array-profile-conversation',
        counterpartUserId: 'array-user',
        counterpartName: 'sam',
        counterpartUsername: 'sam'
      })
    ]);
  });

  it('treats reciprocal mutual likes as visible matches and reverse-direction blocks as hidden users', () => {
    const items = buildConversationListItems(
      'me',
      [
        baseConversation({ id: 'reciprocal-visible' }),
        baseConversation({ id: 'reverse-blocked' })
      ],
      [
        baseParticipant({
          conversation_id: 'reciprocal-visible',
          user_id: 'me',
          profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' })
        }),
        baseParticipant({
          conversation_id: 'reciprocal-visible',
          user_id: 'reciprocal-user',
          profile: baseProfile({ id: 'reciprocal-user', username: 'reciprocal', display_name: 'Reciprocal User' })
        }),
        baseParticipant({
          conversation_id: 'reverse-blocked',
          user_id: 'me',
          profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' })
        }),
        baseParticipant({
          conversation_id: 'reverse-blocked',
          user_id: 'blocked-by-other',
          profile: baseProfile({ id: 'blocked-by-other', username: 'blockedbyother', display_name: 'Blocked By Other' })
        })
      ],
      [
        mutualLike({ user_id: 'reciprocal-user', target_user_id: 'me' }),
        mutualLike({ user_id: 'blocked-by-other', target_user_id: 'me', match_type: 'block', is_mutual: false })
      ],
      [
        {
          matched_user_id: 'reciprocal-user',
          profile: baseProfile({ id: 'reciprocal-user', username: 'reciprocal', display_name: 'Reciprocal User' })
        }
      ]
    );

    expect(items.map((item) => item.conversationId)).toEqual(['reciprocal-visible']);
    expect(items[0]).toEqual(
      expect.objectContaining({
        counterpartUserId: 'reciprocal-user',
        counterpartName: 'Reciprocal User',
        hasConversation: true
      })
    );
  });

  it('keeps missing matched chats recoverable without making them inbox-visible by default', () => {
    const items = buildConversationListItems(
      'me',
      [baseConversation({ id: 'active-conversation' })],
      [
        baseParticipant({ conversation_id: 'active-conversation', user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
        baseParticipant({ conversation_id: 'active-conversation', user_id: 'active-match', profile: baseProfile({ id: 'active-match', username: 'active', display_name: 'Active Match' }) })
      ],
      [
        mutualLike({ target_user_id: 'active-match' }),
        mutualLike({ target_user_id: 'pending-match' }),
        mutualLike({ target_user_id: 'blocked-match', match_type: 'block', is_mutual: false }),
        mutualLike({ target_user_id: 'not-mutual', is_mutual: false })
      ],
      [
        {
          matched_user_id: 'pending-match',
          profile: baseProfile({ id: 'pending-match', username: 'pending', display_name: 'Pending Match' })
        },
        {
          matched_user_id: 'blocked-match',
          profile: baseProfile({ id: 'blocked-match', username: 'blocked', display_name: 'Blocked Match' })
        },
        {
          matched_user_id: 'not-mutual',
          profile: baseProfile({ id: 'not-mutual', username: 'nomatch', display_name: 'Not Mutual' })
        }
      ]
    );

    expect(items).toEqual<ConversationListItem[]>([
      expect.objectContaining({
        conversationId: 'active-conversation',
        counterpartUserId: 'active-match',
        counterpartName: 'Active Match',
        lastMessagePreview: 'Hola, ¿cómo va todo?',
        unreadCount: 2
      }),
      expect.objectContaining({
        conversationId: 'pending:pending-match',
        counterpartUserId: 'pending-match',
        counterpartName: 'Pending Match',
        hasConversation: false,
        lastMessagePreview: null,
        unreadCount: 0
      })
    ]);

    expect(finalizeConversationListItems(items, {})).toEqual<ConversationListItem[]>([
      expect.objectContaining({
        conversationId: 'active-conversation',
        counterpartUserId: 'active-match',
        counterpartName: 'Active Match',
        hasConversation: true
      })
    ]);
  });

  it('promotes silently recovered direct conversations into actionable inbox entries', () => {
    const items = buildConversationListItems(
      'me',
      [],
      [],
      [mutualLike({ target_user_id: 'recovered-match' })],
      [
        {
          matched_user_id: 'recovered-match',
          profile: baseProfile({ id: 'recovered-match', username: 'recover', display_name: 'Recovered Match' })
        }
      ]
    );

    expect(finalizeConversationListItems(items, { 'recovered-match': 'conversation-recovered' })).toEqual<ConversationListItem[]>([
      expect.objectContaining({
        conversationId: 'conversation-recovered',
        counterpartUserId: 'recovered-match',
        counterpartName: 'Recovered Match',
        counterpartUsername: 'recover',
        hasConversation: true,
        lastMessagePreview: null,
        unreadCount: 0
      })
    ]);
  });
});
