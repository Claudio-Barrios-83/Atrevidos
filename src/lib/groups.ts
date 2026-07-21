export type GroupConversationRow = {
  id: string;
  is_group: boolean | null;
  name: string | null;
  avatar_url: string | null;
  last_message_at: string | null;
  created_at: string;
};

export type GroupParticipantProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type GroupParticipantRow = {
  conversation_id: string;
  user_id: string;
  is_active: boolean | null;
  role: string | null;
  profile: GroupParticipantProfile | GroupParticipantProfile[] | null;
};

export type GroupMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  is_deleted: boolean | null;
  created_at: string;
  updated_at: string;
};

export type GroupMessageItem = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
  isOwnMessage: boolean;
  isDeleted: boolean;
};

export type GroupParticipantView = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  role: string;
};

export type GroupConversationView = {
  conversationId: string;
  name: string;
  avatarUrl: string | null;
  participants: GroupParticipantView[];
};

function normalizeProfile(
  profile: GroupParticipantProfile | GroupParticipantProfile[] | null
): GroupParticipantProfile | null {
  return Array.isArray(profile) ? (profile[0] ?? null) : profile;
}

function toTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function buildGroupConversationView(
  conversation: GroupConversationRow,
  participantRows: GroupParticipantRow[]
): GroupConversationView | null {
  if (!conversation.is_group) {
    return null;
  }

  const participants: GroupParticipantView[] = participantRows
    .filter((row) => row.is_active !== false)
    .map((row) => {
      const profile = normalizeProfile(row.profile);

      return {
        userId: row.user_id,
        displayName: profile?.display_name || profile?.username || 'Usuario',
        username: profile?.username || 'usuario',
        avatarUrl: profile?.avatar_url ?? null,
        role: row.role || 'member'
      };
    });

  return {
    conversationId: conversation.id,
    name: conversation.name || 'Grupo sin nombre',
    avatarUrl: conversation.avatar_url,
    participants
  };
}

export function buildGroupMessageItems(activeUserId: string, messages: GroupMessageRow[], participants: GroupParticipantView[]) {
  const nameByUserId = new Map(participants.map((participant) => [participant.userId, participant.displayName]));

  return [...messages]
    .sort((left, right) => toTimestamp(left.created_at) - toTimestamp(right.created_at))
    .map((message) => ({
      id: message.id,
      senderId: message.sender_id,
      senderName:
        message.sender_id === activeUserId ? 'Tú' : nameByUserId.get(message.sender_id) || 'Usuario',
      content: message.is_deleted ? 'Mensaje eliminado' : message.content || '',
      mediaUrl: message.is_deleted ? null : message.media_url,
      mediaType: message.is_deleted ? null : message.media_type,
      createdAt: message.created_at,
      isOwnMessage: message.sender_id === activeUserId,
      isDeleted: Boolean(message.is_deleted)
    })) satisfies GroupMessageItem[];
}
