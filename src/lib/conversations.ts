import type { Database } from '$lib/database.types';

export type UserConversationRow = {
  id: string;
  is_group: boolean | null;
  name: string | null;
  avatar_url: string | null;
  last_message_at: string | null;
  created_at: string;
  last_message_content: string | null;
  last_message_time: string | null;
  last_message_sender: string | null;
  unread_count: number | null;
};

export type ConversationParticipantProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'display_name' | 'avatar_url'
>;

export type ConversationParticipantRow = {
  conversation_id: string;
  user_id: string;
  is_active: boolean | null;
  profile: ConversationParticipantProfile | ConversationParticipantProfile[] | null;
};

export type ConversationMatchRow = Pick<
  Database['public']['Tables']['matches']['Row'],
  'user_id' | 'target_user_id' | 'match_type' | 'is_mutual'
>;

export type ConversationMatchedProfileRow = {
  matched_user_id: string;
  profile: ConversationParticipantProfile | ConversationParticipantProfile[] | null;
};

export type ConversationListItem = {
  conversationId: string;
  counterpartUserId: string;
  counterpartName: string;
  counterpartUsername: string;
  counterpartAvatarUrl: string | null;
  hasConversation: boolean;
  lastActivityAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderName: string | null;
  unreadCount: number;
};

export function finalizeConversationListItems(
  items: ConversationListItem[],
  recoveredConversationIdsByUser: Record<string, string | null | undefined>
) {
  return items.flatMap((item) => {
    if (item.hasConversation) {
      return [item];
    }

    const recoveredConversationId = recoveredConversationIdsByUser[item.counterpartUserId];

    if (!recoveredConversationId) {
      return [];
    }

    return [
      {
        ...item,
        conversationId: recoveredConversationId,
        hasConversation: true
      }
    ];
  });
}

function normalizeProfile(
  profile: ConversationParticipantProfile | ConversationParticipantProfile[] | null
): ConversationParticipantProfile | null {
  return Array.isArray(profile) ? (profile[0] ?? null) : profile;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsedTimestamp = Date.parse(value);
  return Number.isNaN(parsedTimestamp) ? Number.NEGATIVE_INFINITY : parsedTimestamp;
}

function resolveLastActivityAt(row: UserConversationRow) {
  const candidates = [row.last_message_time, row.last_message_at, row.created_at];

  for (const candidate of candidates) {
    if (toTimestamp(candidate) !== Number.NEGATIVE_INFINITY) {
      return candidate ?? null;
    }
  }

  return null;
}

function buildBlockedUserIdSet(activeUserId: string, matchRows: ConversationMatchRow[]) {
  const blockedUserIds = new Set<string>();

  for (const row of matchRows) {
    if (row.match_type !== 'block') {
      continue;
    }

    if (row.user_id === activeUserId) {
      blockedUserIds.add(row.target_user_id);
    }

    if (row.target_user_id === activeUserId) {
      blockedUserIds.add(row.user_id);
    }
  }

  return blockedUserIds;
}

function buildMatchedUserIdSet(activeUserId: string, matchRows: ConversationMatchRow[]) {
  const matchedUserIds = new Set<string>();

  for (const row of matchRows) {
    if (!row.is_mutual || !['like', 'super-like'].includes(row.match_type)) {
      continue;
    }

    if (row.user_id === activeUserId) {
      matchedUserIds.add(row.target_user_id);
    }

    if (row.target_user_id === activeUserId) {
      matchedUserIds.add(row.user_id);
    }
  }

  return matchedUserIds;
}

export function buildConversationListItems(
  activeUserId: string,
  conversations: UserConversationRow[],
  participantRows: ConversationParticipantRow[],
  matchRows: ConversationMatchRow[],
  matchedProfileRows: ConversationMatchedProfileRow[] = []
) {
  const blockedUserIds = buildBlockedUserIdSet(activeUserId, matchRows);
  const matchedUserIds = buildMatchedUserIdSet(activeUserId, matchRows);
  const participantByConversationId = new Map<string, ConversationParticipantRow[]>();
  const visibleCounterpartUserIds = new Set<string>();

  for (const participantRow of participantRows) {
    const participants = participantByConversationId.get(participantRow.conversation_id) ?? [];
    participants.push(participantRow);
    participantByConversationId.set(participantRow.conversation_id, participants);
  }

  const items: ConversationListItem[] = [];

  for (const conversation of conversations) {
    if (conversation.is_group !== false) {
      continue;
    }

    const participants = participantByConversationId.get(conversation.id) ?? [];
    const activeParticipants = participants.filter((participant) => participant.is_active !== false);

    if (activeParticipants.length !== 2) {
      continue;
    }

    if (!activeParticipants.some((participant) => participant.user_id === activeUserId)) {
      continue;
    }

    const counterpartParticipant = activeParticipants.find((participant) => participant.user_id !== activeUserId);

    if (!counterpartParticipant) {
      continue;
    }

    const counterpartProfile = normalizeProfile(counterpartParticipant.profile);

    if (!counterpartProfile) {
      continue;
    }

    if (blockedUserIds.has(counterpartParticipant.user_id) || !matchedUserIds.has(counterpartParticipant.user_id)) {
      continue;
    }

    items.push({
      conversationId: conversation.id,
      counterpartUserId: counterpartParticipant.user_id,
      counterpartName: counterpartProfile.display_name || counterpartProfile.username || 'Usuario',
      counterpartUsername: counterpartProfile.username,
      counterpartAvatarUrl: counterpartProfile.avatar_url,
      hasConversation: true,
      lastActivityAt: resolveLastActivityAt(conversation),
      lastMessagePreview: conversation.last_message_content,
      lastMessageSenderName: conversation.last_message_sender,
      unreadCount: Math.max(0, conversation.unread_count ?? 0)
    });

    visibleCounterpartUserIds.add(counterpartParticipant.user_id);
  }

  for (const matchedProfileRow of matchedProfileRows) {
    if (
      visibleCounterpartUserIds.has(matchedProfileRow.matched_user_id) ||
      blockedUserIds.has(matchedProfileRow.matched_user_id) ||
      !matchedUserIds.has(matchedProfileRow.matched_user_id)
    ) {
      continue;
    }

    const counterpartProfile = normalizeProfile(matchedProfileRow.profile);

    if (!counterpartProfile) {
      continue;
    }

    items.push({
      conversationId: `pending:${matchedProfileRow.matched_user_id}`,
      counterpartUserId: matchedProfileRow.matched_user_id,
      counterpartName: counterpartProfile.display_name || counterpartProfile.username || 'Usuario',
      counterpartUsername: counterpartProfile.username,
      counterpartAvatarUrl: counterpartProfile.avatar_url,
      hasConversation: false,
      lastActivityAt: null,
      lastMessagePreview: null,
      lastMessageSenderName: null,
      unreadCount: 0
    });
  }

  return items.sort((left, right) => toTimestamp(right.lastActivityAt) - toTimestamp(left.lastActivityAt));
}
