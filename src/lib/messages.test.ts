import { describe, expect, it } from 'vitest';
import {
  buildDirectConversationView,
  buildDirectMessageItems,
  createBlockedDirectConversationRevocation,
  shouldIgnoreBlockedDirectConversationUpdate,
  type DirectConversationMatchRow,
  type DirectConversationParticipantProfile,
  type DirectConversationParticipantRow,
  type DirectConversationRow,
  type DirectMessageItem,
  type DirectMessageRow
} from './messages';

const baseConversation = (overrides: Partial<DirectConversationRow> = {}): DirectConversationRow => ({
  id: 'conversation-1',
  is_group: false,
  created_at: '2026-06-05T12:00:00.000Z',
  ...overrides
});

const baseProfile = (
  overrides: Partial<DirectConversationParticipantProfile> = {}
): DirectConversationParticipantProfile => ({
  id: 'match-1',
  username: 'alex',
  display_name: 'Alex',
  avatar_url: null,
  ...overrides
});

const baseParticipant = (
  overrides: Partial<DirectConversationParticipantRow> = {}
): DirectConversationParticipantRow => ({
  conversation_id: 'conversation-1',
  user_id: 'match-1',
  is_active: true,
  profile: baseProfile(),
  ...overrides
});

const mutualLike = (overrides: Partial<DirectConversationMatchRow> = {}): DirectConversationMatchRow => ({
  user_id: 'me',
  target_user_id: 'match-1',
  match_type: 'like',
  is_mutual: true,
  ...overrides
});

const baseMessage = (overrides: Partial<DirectMessageRow> = {}): DirectMessageRow => ({
  id: 'message-1',
  conversation_id: 'conversation-1',
  sender_id: 'me',
  content: 'Hola',
  media_url: null,
  media_type: null,
  is_deleted: false,
  created_at: '2026-06-05T12:00:00.000Z',
  updated_at: '2026-06-05T12:00:00.000Z',
  ...overrides
});

describe('buildDirectConversationView', () => {
  it('returns the counterpart metadata for an accessible direct conversation', () => {
    const view = buildDirectConversationView(
      'me',
      baseConversation(),
      [
        baseParticipant({
          user_id: 'me',
          profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' })
        }),
        baseParticipant()
      ],
      [mutualLike()]
    );

    expect(view).toEqual({
      conversationId: 'conversation-1',
      counterpartUserId: 'match-1',
      counterpartName: 'Alex',
      counterpartUsername: 'alex',
      counterpartAvatarUrl: null
    });
  });

  it('rejects conversations that are grouped, blocked, non-mutual, or malformed', () => {
    expect(
      buildDirectConversationView(
        'me',
        baseConversation({ is_group: true }),
        [baseParticipant()],
        [mutualLike()]
      )
    ).toBe(null);

    expect(
      buildDirectConversationView(
        'me',
        baseConversation(),
        [
          baseParticipant({
            user_id: 'me',
            profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' })
          }),
          baseParticipant(),
          baseParticipant({
            user_id: 'third-user',
            profile: baseProfile({ id: 'third-user', username: 'third', display_name: 'Third' })
          })
        ],
        [mutualLike()]
      )
    ).toBe(null);

    expect(
      buildDirectConversationView(
        'me',
        baseConversation(),
        [baseParticipant()],
        [mutualLike({ is_mutual: false })]
      )
    ).toBe(null);

    expect(
      buildDirectConversationView(
        'me',
        baseConversation(),
        [baseParticipant()],
        [mutualLike({ match_type: 'block', is_mutual: false })]
      )
    ).toBe(null);

    expect(
      buildDirectConversationView(
        'me',
        baseConversation(),
        [baseParticipant()],
        [mutualLike()]
      )
    ).toBe(null);

    expect(
      buildDirectConversationView(
        'me',
        baseConversation(),
        [
          baseParticipant({ user_id: 'me', is_active: false, profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
          baseParticipant()
        ],
        [mutualLike()]
      )
    ).toBe(null);

    expect(
      buildDirectConversationView(
        'me',
        baseConversation(),
        [
          baseParticipant({ user_id: 'me', profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' }) }),
          baseParticipant({ user_id: 'match-1', is_active: false })
        ],
        [mutualLike()]
      )
    ).toBe(null);
  });

  it('supports Supabase array joins and falls back to username when no display name exists', () => {
    const view = buildDirectConversationView(
      'me',
      baseConversation(),
      [
        baseParticipant({
          user_id: 'me',
          profile: baseProfile({ id: 'me', username: 'me', display_name: 'Me' })
        }),
        baseParticipant({
          user_id: 'array-user',
          profile: [baseProfile({ id: 'array-user', username: 'sam', display_name: null })]
        })
      ],
      [mutualLike({ target_user_id: 'array-user' })]
    );

    expect(view).toEqual({
      conversationId: 'conversation-1',
      counterpartUserId: 'array-user',
      counterpartName: 'sam',
      counterpartUsername: 'sam',
      counterpartAvatarUrl: null
    });
  });
});

describe('buildDirectMessageItems', () => {
  it('sorts messages chronologically and annotates ownership', () => {
    const items = buildDirectMessageItems('me', [
      baseMessage({ id: 'later', sender_id: 'match-1', content: '¿Qué tal?', created_at: '2026-06-05T12:05:00.000Z' }),
      baseMessage({ id: 'earlier', sender_id: 'me', content: 'Hola', created_at: '2026-06-05T12:00:00.000Z' })
    ]);

    expect(items).toEqual<DirectMessageItem[]>([
      {
        id: 'earlier',
        conversationId: 'conversation-1',
        senderId: 'me',
        content: 'Hola',
        createdAt: '2026-06-05T12:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
        isOwnMessage: true,
        isDeleted: false
      },
      {
        id: 'later',
        conversationId: 'conversation-1',
        senderId: 'match-1',
        content: '¿Qué tal?',
        createdAt: '2026-06-05T12:05:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
        isOwnMessage: false,
        isDeleted: false
      }
    ]);
  });

  it('renders safe fallback content for deleted or media-only messages', () => {
    const items = buildDirectMessageItems('me', [
      baseMessage({ id: 'deleted', content: null, is_deleted: true }),
      baseMessage({ id: 'media-only', content: null, media_url: 'https://example.com/file.jpg', media_type: 'image/jpeg' })
    ]);

    expect(items).toEqual<DirectMessageItem[]>([
      expect.objectContaining({ id: 'deleted', content: 'Mensaje eliminado', isDeleted: true }),
      expect.objectContaining({
        id: 'media-only',
        content: 'Contenido multimedia no compatible todavía.',
        isDeleted: false
      })
    ]);
  });
});

describe('blocked direct conversation helpers', () => {
  it('creates a revocation payload with a user-facing explanation', () => {
    expect(createBlockedDirectConversationRevocation('conversation-1', 'match-1', 'Alex')).toEqual({
      conversationId: 'conversation-1',
      counterpartUserId: 'match-1',
      message: 'Ya no puedes acceder a esta conversación porque has bloqueado a Alex.'
    });
  });

  it('ignores stale updates that belong to the locally revoked conversation or counterpart', () => {
    const revocation = createBlockedDirectConversationRevocation('conversation-1', 'match-1', 'Alex');

    expect(shouldIgnoreBlockedDirectConversationUpdate(revocation, 'conversation-1')).toBe(true);
    expect(shouldIgnoreBlockedDirectConversationUpdate(revocation, null, 'match-1')).toBe(true);
    expect(shouldIgnoreBlockedDirectConversationUpdate(revocation, 'conversation-2', 'match-2')).toBe(false);
    expect(shouldIgnoreBlockedDirectConversationUpdate(null, 'conversation-1', 'match-1')).toBe(false);
  });
});
