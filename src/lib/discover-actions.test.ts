import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedDiscoverMatch } from './discover-actions';

const { fromMock, upsertMock, selectMock, singleMock } = vi.hoisted(() => {
  const singleMock = vi.fn<() => Promise<{ data: SavedDiscoverMatch | null; error: Error | null }>>();
  const selectMock = vi.fn(() => ({ single: singleMock }));
  const upsertMock = vi.fn(() => ({ select: selectMock }));
  const fromMock = vi.fn(() => ({ upsert: upsertMock }));

  return { fromMock, upsertMock, selectMock, singleMock };
});

vi.mock('$lib/supabase/client', () => ({
  supabase: {
    from: fromMock
  }
}));

import { saveDiscoverMatch } from './discover-actions';

describe('saveDiscoverMatch', () => {
  beforeEach(() => {
    fromMock.mockClear();
    upsertMock.mockClear();
    selectMock.mockClear();
    singleMock.mockReset();
  });

  it('persists discover matches through atomic upsert and returns the selected row', async () => {
    const savedMatch: SavedDiscoverMatch = {
      id: 'match-1',
      user_id: 'me',
      target_user_id: 'target',
      match_type: 'block',
      is_mutual: false,
      created_at: '2026-06-05T19:00:00.000Z'
    };

    singleMock.mockResolvedValue({ data: savedMatch, error: null });

    await expect(saveDiscoverMatch('me', 'target', 'block')).resolves.toEqual(savedMatch);

    expect(fromMock).toHaveBeenCalledWith('matches');
    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: 'me',
        target_user_id: 'target',
        match_type: 'block'
      },
      {
        onConflict: 'user_id,target_user_id'
      }
    );
    expect(selectMock).toHaveBeenCalledWith('id, user_id, target_user_id, match_type, is_mutual, created_at');
    expect(singleMock).toHaveBeenCalledTimes(1);
  });

  it('rethrows Supabase errors so the UI can surface blocking failures', async () => {
    const error = new Error('upsert failed');
    singleMock.mockResolvedValue({ data: null, error });

    await expect(saveDiscoverMatch('me', 'target', 'like')).rejects.toThrow('upsert failed');
  });
});
