import type { Database } from '$lib/database.types';

export type DirectConversationRow = {
  id: string;
  is_group: boolean | null;
  created_at: string;
};

export type DirectConversationParticipantProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'display_name' | 'avatar_url'
>;

export type DirectConversationParticipantRow = {
  conversation_id: string;
  user_id: string;
  is_active: boolean | null;
  profile: DirectConversationParticipantProfile | DirectConversationParticipantProfile[] | null;
};

export type DirectConversationMatchRow = Pick<
  Database['public']['Tables']['matches']['Row'],
  'user_id' | 'target_user_id' | 'match_type' | 'is_mutual'
>;

export type DirectConversationView = {
  conversationId: string;
  counterpartUserId: string;
  counterpartName: string;
  counterpartUsername: string;
  counterpartAvatarUrl: string | null;
};

export type DirectMessageRow = {
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

export type DirectMessageItem = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isOwnMessage: boolean;
  isDeleted: boolean;
};

export type BlockedDirectConversationRevocation = {
  conversationId: string;
  counterpartUserId: string;
  message: string;
};

function normalizeProfile(
  profile: DirectConversationParticipantProfile | DirectConversationParticipantProfile[] | null
): DirectConversationParticipantProfile | null {
  return Array.isArray(profile) ? (profile[0] ?? null) : profile;
}

function isMutualMatch(activeUserId: string, counterpartUserId: string, rows: DirectConversationMatchRow[]) {
  return rows.some((row) => {
    if (!row.is_mutual || !['like', 'super-like'].includes(row.match_type)) {
      return false;
    }

    return (
      (row.user_id === activeUserId && row.target_user_id === counterpartUserId) ||
      (row.user_id === counterpartUserId && row.target_user_id === activeUserId)
    );
  });
}

function isBlocked(activeUserId: string, counterpartUserId: string, rows: DirectConversationMatchRow[]) {
  return rows.some((row) => {
    if (row.match_type !== 'block') {
      return false;
    }

    return (
      (row.user_id === activeUserId && row.target_user_id === counterpartUserId) ||
      (row.user_id === counterpartUserId && row.target_user_id === activeUserId)
    );
  });
}

function toTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function resolveMessageContent(message: DirectMessageRow) {
  if (message.is_deleted) {
    return 'Mensaje eliminado';
  }

  if (message.content && message.content.trim().length > 0) {
    return message.content;
  }

  if (message.media_url) {
    return 'Contenido multimedia no compatible todavía.';
  }

  return '';
}

export function buildDirectConversationView(
  activeUserId: string,
  conversation: DirectConversationRow,
  participants: DirectConversationParticipantRow[],
  matchRows: DirectConversationMatchRow[]
): DirectConversationView | null {
  if (conversation.is_group !== false) {
    return null;
  }

  const activeParticipants = participants.filter(
    (participant) => participant.conversation_id === conversation.id && participant.is_active !== false
  );

  if (activeParticipants.length !== 2) {
    return null;
  }

  if (!activeParticipants.some((participant) => participant.user_id === activeUserId)) {
    return null;
  }

  const counterpartParticipant = activeParticipants.find((participant) => participant.user_id !== activeUserId);

  if (!counterpartParticipant) {
    return null;
  }

  const counterpartProfile = normalizeProfile(counterpartParticipant.profile);

  if (!counterpartProfile) {
    return null;
  }

  if (
    isBlocked(activeUserId, counterpartParticipant.user_id, matchRows) ||
    !isMutualMatch(activeUserId, counterpartParticipant.user_id, matchRows)
  ) {
    return null;
  }

  return {
    conversationId: conversation.id,
    counterpartUserId: counterpartParticipant.user_id,
    counterpartName: counterpartProfile.display_name || counterpartProfile.username || 'Usuario',
    counterpartUsername: counterpartProfile.username,
    counterpartAvatarUrl: counterpartProfile.avatar_url
  };
}

export function buildDirectMessageItems(activeUserId: string, messages: DirectMessageRow[]) {
  return [...messages]
    .sort((left, right) => toTimestamp(left.created_at) - toTimestamp(right.created_at))
    .map((message) => ({
      id: message.id,
      conversationId: message.conversation_id,
      senderId: message.sender_id,
      content: resolveMessageContent(message),
      createdAt: message.created_at,
      updatedAt: message.updated_at,
      isOwnMessage: message.sender_id === activeUserId,
      isDeleted: Boolean(message.is_deleted)
    }));
}

export function createBlockedDirectConversationRevocation(
  conversationId: string,
  counterpartUserId: string,
  counterpartName?: string | null
): BlockedDirectConversationRevocation {
  const displayName = counterpartName?.trim() || 'esta persona';

  return {
    conversationId,
    counterpartUserId,
    message: `Ya no puedes acceder a esta conversación porque has bloqueado a ${displayName}.`
  };
}

export function shouldIgnoreBlockedDirectConversationUpdate(
  revocation: BlockedDirectConversationRevocation | null,
  conversationId: string | null | undefined,
  counterpartUserId?: string | null
) {
  if (!revocation) {
    return false;
  }

  if (conversationId && revocation.conversationId === conversationId) {
    return true;
  }

  if (counterpartUserId && revocation.counterpartUserId === counterpartUserId) {
    return true;
  }

  return false;
}
