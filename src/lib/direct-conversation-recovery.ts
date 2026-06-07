type DirectConversationRecoveryRpcArgs = {
  user1: string;
  user2: string;
};

type DirectConversationRecoveryRpcResult = {
  data: unknown;
  error: unknown;
};

export type DirectConversationRpcClient = {
  rpc: (
    fn: 'create_conversation_for_match',
    args: DirectConversationRecoveryRpcArgs
  ) => Promise<DirectConversationRecoveryRpcResult>;
};

export function createDirectConversationRecoveryClient(supabase: {
  rpc: (...args: any[]) => unknown;
}): DirectConversationRpcClient {
  return {
    rpc: async (fn, args) => (await supabase.rpc(fn, args)) as DirectConversationRecoveryRpcResult
  };
}

export type RecoverDirectConversationIdsParams = {
  activeUserId: string;
  candidateUserIds: string[];
  supabase: DirectConversationRpcClient;
  existingConversationIdByUser?: Record<string, string | null | undefined>;
  blockedUserIds?: ReadonlySet<string>;
  mutualUserIds?: ReadonlySet<string>;
};

export function extractRecoveredConversationId(data: unknown): string | null {
  return typeof data === 'string' && data.trim().length > 0 ? data : null;
}

export function getMissingDirectConversationMatchedUserIds(
  activeUserId: string,
  candidateUserIds: string[],
  existingConversationIdByUser: Record<string, string | null | undefined> = {},
  blockedUserIds: ReadonlySet<string> = new Set<string>(),
  mutualUserIds?: ReadonlySet<string>
) {
  return Array.from(new Set(candidateUserIds)).filter((candidateUserId) => {
    if (!candidateUserId || candidateUserId === activeUserId) {
      return false;
    }

    if (blockedUserIds.has(candidateUserId)) {
      return false;
    }

    if (mutualUserIds && !mutualUserIds.has(candidateUserId)) {
      return false;
    }

    return !existingConversationIdByUser[candidateUserId];
  });
}

export async function recoverDirectConversationIds({
  activeUserId,
  candidateUserIds,
  supabase,
  existingConversationIdByUser = {},
  blockedUserIds = new Set<string>(),
  mutualUserIds
}: RecoverDirectConversationIdsParams) {
  const recoveredConversationIdsByUser: Record<string, string> = {};
  const uniqueCandidateUserIds = getMissingDirectConversationMatchedUserIds(
    activeUserId,
    candidateUserIds,
    existingConversationIdByUser,
    blockedUserIds,
    mutualUserIds
  );

  const recoveryResults = await Promise.allSettled(
    uniqueCandidateUserIds.map(async (candidateUserId) => {
      const { data, error } = await supabase.rpc('create_conversation_for_match', {
        user1: activeUserId,
        user2: candidateUserId
      });

      if (error) {
        return null;
      }

      const conversationId = extractRecoveredConversationId(data);

      return conversationId ? ([candidateUserId, conversationId] as const) : null;
    })
  );

  for (const result of recoveryResults) {
    if (result.status !== 'fulfilled' || !result.value) {
      continue;
    }

    const [candidateUserId, conversationId] = result.value;
    recoveredConversationIdsByUser[candidateUserId] = conversationId;
  }

  return recoveredConversationIdsByUser;
}
