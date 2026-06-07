import { describe, expect, it } from 'vitest';
import {
  applyDiscoverFilters,
  buildDiscoverMatchInsert,
  buildDiscoverPassedProfilesStorageKey,
  collectBlockedUserIds,
  collectExcludedDiscoverUserIds,
  collectInterestOptions,
  EMPTY_DISCOVER_FILTERS,
  excludeDiscoverProfilesById,
  excludeRowsFromBlockedUsers,
  formatLastActiveDate,
  isRecentlyOnline,
  normalizeDiscoverText,
  parseDiscoverPassedProfileIds,
  removeDiscoverProfile,
  serializeDiscoverPassedProfileIds,
  type DiscoverMatchRow,
  type DiscoverProfile
} from './discover';

const baseProfile = (overrides: Partial<DiscoverProfile>): DiscoverProfile => ({
  id: 'profile-1',
  username: 'alex',
  display_name: 'Alex',
  avatar_url: null,
  bio: 'Hola',
  location: 'Madrid',
  interests: ['Música', 'Viajes'],
  relationship_intent: 'amistad',
  last_active_at: '2026-06-04T10:00:00.000Z',
  is_active: true,
  onboarding_completed_at: '2026-06-01T10:00:00.000Z',
  age_confirmed: true,
  consent_acknowledged: true,
  ...overrides
});

describe('normalizeDiscoverText', () => {
  it('normalizes case, accents, and extra spaces for loose matching', () => {
    expect(normalizeDiscoverText('  Bogotá   DC ')).toBe('bogota dc');
  });
});

describe('isRecentlyOnline', () => {
  it('returns true when the profile was active inside the recent window', () => {
    const now = new Date('2026-06-04T12:00:00.000Z');

    expect(isRecentlyOnline('2026-06-03T18:00:00.000Z', now)).toBe(true);
  });

  it('returns false when the profile has never been active or is outside the recent window', () => {
    const now = new Date('2026-06-04T12:00:00.000Z');

    expect(isRecentlyOnline(null, now)).toBe(false);
    expect(isRecentlyOnline('2026-05-30T11:59:59.000Z', now)).toBe(false);
  });

  it('returns false for future timestamps', () => {
    const now = new Date('2026-06-04T12:00:00.000Z');

    expect(isRecentlyOnline('2026-06-04T12:00:01.000Z', now)).toBe(false);
  });
});

describe('formatLastActiveDate', () => {
  it('falls back when the timestamp is missing or malformed', () => {
    expect(formatLastActiveDate(null)).toBe('Sin actividad reciente');
    expect(formatLastActiveDate('not-a-date')).toBe('Sin actividad reciente');
  });
});

describe('applyDiscoverFilters', () => {
  const now = new Date('2026-06-04T12:00:00.000Z');
  const profiles = [
    baseProfile({ id: '1', username: 'alex', display_name: 'Alex', location: 'Madrid', interests: ['Música', 'Viajes'], relationship_intent: 'amistad', last_active_at: '2026-06-04T10:00:00.000Z' }),
    baseProfile({ id: '2', username: 'bea', display_name: 'Bea', location: 'Bogotá', interests: ['Arte', 'Café'], relationship_intent: 'citas', last_active_at: '2026-05-31T10:00:00.000Z' }),
    baseProfile({ id: '3', username: 'cami', display_name: 'Cami', location: 'Madrid Centro', interests: ['Café de especialidad', 'Lectura'], relationship_intent: 'relacion_seria', last_active_at: null })
  ];

  it('filters by normalized location, interest, relationship intent, and recent activity together', () => {
    const result = applyDiscoverFilters(
      profiles,
      {
        location: ' bogota ',
        interest: 'cafe',
        relationshipIntent: 'citas',
        onlineRecentlyOnly: false
      },
      now
    );

    expect(result.map((profile) => profile.id)).toEqual(['2']);
  });

  it('filters to only recently online profiles when requested', () => {
    const result = applyDiscoverFilters(
      profiles,
      {
        ...EMPTY_DISCOVER_FILTERS,
        onlineRecentlyOnly: true
      },
      now
    );

    expect(result.map((profile) => profile.id)).toEqual(['1']);
  });
});

describe('collectBlockedUserIds', () => {
  it('collects users blocked by or blocking the active user', () => {
    const rows: DiscoverMatchRow[] = [
      { user_id: 'me', target_user_id: 'blocked-by-me', match_type: 'block' },
      { user_id: 'blocked-me', target_user_id: 'me', match_type: 'block' }
    ];

    expect(Array.from(collectBlockedUserIds(rows, 'me')).sort()).toEqual([
      'blocked-by-me',
      'blocked-me'
    ]);
  });
});

describe('collectExcludedDiscoverUserIds', () => {
  it('excludes likes, super-likes and blocks persisted by the active user, plus users who blocked them', () => {
    const rows: DiscoverMatchRow[] = [
      { user_id: 'me', target_user_id: 'liked-by-me', match_type: 'like' },
      { user_id: 'me', target_user_id: 'super-liked-by-me', match_type: 'super-like' },
      { user_id: 'me', target_user_id: 'blocked-by-me', match_type: 'block' },
      { user_id: 'blocked-me', target_user_id: 'me', match_type: 'block' },
      { user_id: 'liked-me', target_user_id: 'me', match_type: 'like' }
    ];

    expect(Array.from(collectExcludedDiscoverUserIds(rows, 'me')).sort()).toEqual([
      'blocked-by-me',
      'blocked-me',
      'liked-by-me',
      'super-liked-by-me'
    ]);
  });
});

describe('excludeRowsFromBlockedUsers', () => {
  it('removes rows whose user_id belongs to a blocked user and keeps null user_id rows', () => {
    const rows = [
      { id: '1', user_id: 'visible-user' },
      { id: '2', user_id: 'blocked-user' },
      { id: '3', user_id: null }
    ];

    expect(excludeRowsFromBlockedUsers(rows, new Set(['blocked-user']))).toEqual([
      { id: '1', user_id: 'visible-user' },
      { id: '3', user_id: null }
    ]);
  });
});

describe('excludeDiscoverProfilesById', () => {
  it('removes profiles hidden by persisted likes, blocks or passes', () => {
    const profiles = [
      baseProfile({ id: '1' }),
      baseProfile({ id: '2', username: 'bea' }),
      baseProfile({ id: '3', username: 'cami' })
    ];

    expect(excludeDiscoverProfilesById(profiles, new Set(['2', '3'])).map((profile) => profile.id)).toEqual([
      '1'
    ]);
  });
});

describe('buildDiscoverMatchInsert', () => {
  it('creates the payload expected by matches writes', () => {
    expect(buildDiscoverMatchInsert('me', 'target', 'like')).toEqual({
      user_id: 'me',
      target_user_id: 'target',
      match_type: 'like'
    });
  });
});

describe('discover passed profiles storage helpers', () => {
  it('builds a stable per-user storage key', () => {
    expect(buildDiscoverPassedProfilesStorageKey('user-123')).toBe('discover:passed:user-123');
  });

  it('serializes unique ids deterministically and parses them back safely', () => {
    const serialized = serializeDiscoverPassedProfileIds(['b', 'a', 'b']);

    expect(serialized).toBe('["a","b"]');
    expect(Array.from(parseDiscoverPassedProfileIds(serialized))).toEqual(['a', 'b']);
  });

  it('ignores malformed or non-array persisted payloads', () => {
    expect(Array.from(parseDiscoverPassedProfileIds('not-json'))).toEqual([]);
    expect(Array.from(parseDiscoverPassedProfileIds('{"foo":"bar"}'))).toEqual([]);
    expect(Array.from(parseDiscoverPassedProfileIds('["ok","",42,null]'))).toEqual(['ok']);
  });
});

describe('removeDiscoverProfile', () => {
  it('removes only the acted profile from the current list', () => {
    const profiles = [
      baseProfile({ id: '1' }),
      baseProfile({ id: '2', username: 'bea' }),
      baseProfile({ id: '3', username: 'cami' })
    ];

    expect(removeDiscoverProfile(profiles, '2').map((profile) => profile.id)).toEqual(['1', '3']);
  });
});

describe('collectInterestOptions', () => {
  it('returns unique, alphabetized interest tags', () => {
    const result = collectInterestOptions([
      baseProfile({ interests: ['Viajes', 'Arte'] }),
      baseProfile({ id: '2', interests: ['arte', 'Café'] }),
      baseProfile({ id: '3', interests: null })
    ]);

    expect(result).toEqual(['Arte', 'Café', 'Viajes']);
  });
});
