import type { Database } from '$lib/database.types';

export type MutualMatchProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'display_name' | 'avatar_url' | 'location' | 'interests' | 'relationship_intent'
>;

export type MutualMatchRow = Pick<
  Database['public']['Tables']['matches']['Row'],
  'id' | 'target_user_id' | 'match_type' | 'created_at'
> & {
  target_profile: MutualMatchProfile | MutualMatchProfile[] | null;
};

export type MatchVisibilityRow = Pick<
  Database['public']['Tables']['matches']['Row'],
  'user_id' | 'target_user_id' | 'match_type'
>;

export type MatchListItem = {
  id: string;
  matchedUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  location: string | null;
  interests: string[];
  relationshipIntent: MutualMatchProfile['relationship_intent'];
  matchedAt: string;
};

export type ConversationParticipantRow = {
  conversation_id: string;
  user_id: string;
  is_active: boolean | null;
};

export type ConversationRow = {
  id: string;
  is_group: boolean | null;
};

function normalizeTargetProfile(
  profile: MutualMatchProfile | MutualMatchProfile[] | null
): MutualMatchProfile | null {
  return Array.isArray(profile) ? (profile[0] ?? null) : profile;
}

function toTimestamp(value: string) {
  const parsedTimestamp = Date.parse(value);
  return Number.isNaN(parsedTimestamp) ? Number.NEGATIVE_INFINITY : parsedTimestamp;
}

export function collectBlockedMatchUserIds(rows: MatchVisibilityRow[], activeUserId: string) {
  const blockedUserIds = new Set<string>();

  for (const row of rows) {
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

export function buildMatchListItems(rows: MutualMatchRow[], blockedUserIds: ReadonlySet<string> = new Set()) {
  const dedupedByMatchedUser = new Map<string, MatchListItem>();

  for (const row of rows) {
    if (blockedUserIds.has(row.target_user_id)) {
      continue;
    }

    const profile = normalizeTargetProfile(row.target_profile);

    if (!profile) {
      continue;
    }

    const existing = dedupedByMatchedUser.get(row.target_user_id);

    if (existing && toTimestamp(existing.matchedAt) >= toTimestamp(row.created_at)) {
      continue;
    }

    dedupedByMatchedUser.set(row.target_user_id, {
      id: row.id,
      matchedUserId: row.target_user_id,
      username: profile.username,
      displayName: profile.display_name || profile.username || 'Usuario',
      avatarUrl: profile.avatar_url,
      location: profile.location,
      interests: profile.interests ?? [],
      relationshipIntent: profile.relationship_intent,
      matchedAt: row.created_at
    });
  }

  return Array.from(dedupedByMatchedUser.values()).sort(
    (left, right) => toTimestamp(right.matchedAt) - toTimestamp(left.matchedAt)
  );
}

export function removeMatchListItemsByUser<T extends { matchedUserId: string }>(items: T[], blockedUserId: string) {
  return items.filter((item) => item.matchedUserId !== blockedUserId);
}

export function indexConversationIdsByMatchedUser(
  activeUserId: string,
  matchedUserIds: string[],
  participants: ConversationParticipantRow[],
  conversations: ConversationRow[]
) {
  const matchedUserIdSet = new Set(matchedUserIds);
  const directConversationIds = new Set(
    conversations.filter((conversation) => conversation.is_group === false).map((conversation) => conversation.id)
  );
  const participantsByConversationId = new Map<string, Set<string>>();

  for (const participant of participants) {
    if (participant.is_active === false) {
      continue;
    }

    if (!directConversationIds.has(participant.conversation_id)) {
      continue;
    }

    const participantSet = participantsByConversationId.get(participant.conversation_id) ?? new Set<string>();
    participantSet.add(participant.user_id);
    participantsByConversationId.set(participant.conversation_id, participantSet);
  }

  const conversationIdByMatchedUser: Record<string, string> = {};

  for (const [conversationId, participantUserIds] of participantsByConversationId.entries()) {
    if (!participantUserIds.has(activeUserId) || participantUserIds.size !== 2) {
      continue;
    }

    for (const participantUserId of participantUserIds) {
      if (participantUserId !== activeUserId && matchedUserIdSet.has(participantUserId)) {
        conversationIdByMatchedUser[participantUserId] = conversationId;
      }
    }
  }

  return conversationIdByMatchedUser;
}
