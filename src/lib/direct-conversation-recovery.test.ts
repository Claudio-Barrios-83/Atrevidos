import { describe, expect, it, vi } from 'vitest';
import {
  getMissingDirectConversationMatchedUserIds,
  recoverDirectConversationIds,
  type DirectConversationRpcClient
} from './direct-conversation-recovery';

describe('getMissingDirectConversationMatchedUserIds', () => {
  it('dedupes matched user ids and skips self, blanks, blocked/non-mutual users, and users that already have a conversation', () => {
    expect(
      getMissingDirectConversationMatchedUserIds(
        'me',
        ['match-1', 'match-2', 'me', '', 'match-1', 'match-3', 'blocked-user', 'non-mutual-user'],
        {
          'match-2': 'conversation-2'
        },
        new Set(['blocked-user']),
        new Set(['match-1', 'match-2', 'match-3', 'blocked-user'])
      )
    ).toEqual(['match-1', 'match-3']);
  });
});

describe('recoverDirectConversationIds', () => {
  it('calls the match bootstrap RPC only for missing eligible users and returns only recovered ids', async () => {
    const rpc = vi.fn<DirectConversationRpcClient['rpc']>()
      .mockResolvedValueOnce({ data: 'conversation-1', error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const result = await recoverDirectConversationIds({
      supabase: { rpc },
      activeUserId: 'me',
      candidateUserIds: ['match-1', 'match-2', 'match-2', 'blocked-user', 'match-3'],
      existingConversationIdByUser: { 'match-3': 'conversation-3' },
      blockedUserIds: new Set(['blocked-user']),
      mutualUserIds: new Set(['match-1', 'match-2', 'match-3', 'blocked-user'])
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, 'create_conversation_for_match', {
      user1: 'me',
      user2: 'match-1'
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'create_conversation_for_match', {
      user1: 'me',
      user2: 'match-2'
    });
    expect(result).toEqual({
      'match-1': 'conversation-1'
    });
  });

  it('keeps failed rpc recoveries pending instead of claiming success', async () => {
    const rpc = vi.fn<DirectConversationRpcClient['rpc']>().mockResolvedValue({
      data: null,
      error: new Error('rpc failed')
    });

    await expect(
      recoverDirectConversationIds({
        supabase: { rpc },
        activeUserId: 'me',
        candidateUserIds: ['match-1']
      })
    ).resolves.toEqual({});
  });
});
