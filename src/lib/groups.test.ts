import { describe, expect, it } from 'vitest';
import {
  buildGroupConversationView,
  buildGroupMessageItems,
  type GroupConversationRow,
  type GroupMessageRow,
  type GroupParticipantRow
} from './groups';

const baseConversation = (overrides: Partial<GroupConversationRow> = {}): GroupConversationRow => ({
  id: 'group-1',
  is_group: true,
  name: 'Amigos de la playa',
  avatar_url: null,
  last_message_at: '2026-06-05T12:00:00.000Z',
  created_at: '2026-06-01T12:00:00.000Z',
  ...overrides
});

const baseParticipant = (overrides: Partial<GroupParticipantRow> = {}): GroupParticipantRow => ({
  conversation_id: 'group-1',
  user_id: 'user-1',
  is_active: true,
  role: 'member',
  profile: { id: 'user-1', username: 'ana', display_name: 'Ana', avatar_url: null },
  ...overrides
});

describe('buildGroupConversationView', () => {
  it('returns null when the conversation is not a group', () => {
    expect(buildGroupConversationView(baseConversation({ is_group: false }), [])).toBeNull();
  });

  it('builds a view with active participants only, using profile fallbacks', () => {
    const view = buildGroupConversationView(baseConversation(), [
      baseParticipant({ user_id: 'user-1', profile: { id: 'user-1', username: 'ana', display_name: 'Ana', avatar_url: null } }),
      baseParticipant({ user_id: 'user-2', role: 'admin', profile: { id: 'user-2', username: 'beto', display_name: null, avatar_url: null } }),
      baseParticipant({ user_id: 'user-3', is_active: false, profile: { id: 'user-3', username: 'inactivo', display_name: 'Inactivo', avatar_url: null } })
    ]);

    expect(view).toEqual({
      conversationId: 'group-1',
      name: 'Amigos de la playa',
      avatarUrl: null,
      participants: [
        { userId: 'user-1', displayName: 'Ana', username: 'ana', avatarUrl: null, role: 'member' },
        { userId: 'user-2', displayName: 'beto', username: 'beto', avatarUrl: null, role: 'admin' }
      ]
    });
  });

  it('falls back to a default name when the group has none', () => {
    const view = buildGroupConversationView(baseConversation({ name: null }), []);
    expect(view?.name).toBe('Grupo sin nombre');
  });
});

describe('buildGroupMessageItems', () => {
  const participants = [
    { userId: 'me', displayName: 'Tú', username: 'me', avatarUrl: null, role: 'admin' },
    { userId: 'user-2', displayName: 'Beto', username: 'beto', avatarUrl: null, role: 'member' }
  ];

  const baseMessage = (overrides: Partial<GroupMessageRow> = {}): GroupMessageRow => ({
    id: 'message-1',
    conversation_id: 'group-1',
    sender_id: 'me',
    content: 'Hola a todos',
    media_url: null,
    media_type: null,
    is_deleted: false,
    created_at: '2026-06-05T12:00:00.000Z',
    updated_at: '2026-06-05T12:00:00.000Z',
    ...overrides
  });

  it('labels the sender name and marks own messages', () => {
    const items = buildGroupMessageItems('me', [
      baseMessage({ id: 'a', sender_id: 'me' }),
      baseMessage({ id: 'b', sender_id: 'user-2', content: 'Hola!' })
    ], participants);

    expect(items).toEqual([
      expect.objectContaining({ id: 'a', senderName: 'Tú', isOwnMessage: true }),
      expect.objectContaining({ id: 'b', senderName: 'Beto', isOwnMessage: false })
    ]);
  });

  it('exposes media and hides content for deleted messages', () => {
    const items = buildGroupMessageItems('me', [
      baseMessage({ id: 'deleted', content: null, is_deleted: true, media_url: 'https://example.com/x.jpg' }),
      baseMessage({ id: 'media', content: null, media_url: 'https://example.com/x.jpg', media_type: 'image/jpeg' })
    ], participants);

    expect(items).toEqual([
      expect.objectContaining({ id: 'deleted', content: 'Mensaje eliminado', mediaUrl: null }),
      expect.objectContaining({ id: 'media', content: '', mediaUrl: 'https://example.com/x.jpg', mediaType: 'image/jpeg' })
    ]);
  });
});
