import type { Database } from '$lib/database.types';
import type { RelationshipIntent } from '$lib/onboarding';

export type DiscoverProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  | 'id'
  | 'username'
  | 'display_name'
  | 'avatar_url'
  | 'bio'
  | 'location'
  | 'interests'
  | 'relationship_intent'
  | 'last_active_at'
  | 'is_active'
  | 'onboarding_completed_at'
  | 'age_confirmed'
  | 'consent_acknowledged'
  | 'is_verified'
>;

export type DiscoverFilters = {
  location: string;
  interest: string;
  relationshipIntent: RelationshipIntent | '';
  onlineRecentlyOnly: boolean;
};

export const EMPTY_DISCOVER_FILTERS: DiscoverFilters = {
  location: '',
  interest: '',
  relationshipIntent: '',
  onlineRecentlyOnly: false
};

export const RECENTLY_ONLINE_WINDOW_HOURS = 72;

export type DiscoverMatchRow = Pick<
  Database['public']['Tables']['matches']['Row'],
  'user_id' | 'target_user_id' | 'match_type'
>;

export type DiscoverPersistedMatchType = Extract<
  Database['public']['Tables']['matches']['Row']['match_type'],
  'like' | 'block' | 'super-like'
>;

export const DISCOVER_PASSED_PROFILES_STORAGE_KEY_PREFIX = 'discover:passed:';

export type DiscoverMatchInsert = Pick<
  Database['public']['Tables']['matches']['Insert'],
  'user_id' | 'target_user_id' | 'match_type'
>;

export function normalizeDiscoverText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function isRecentlyOnline(lastActiveAt: string | null | undefined, now = new Date()) {
  if (!lastActiveAt) {
    return false;
  }

  const timestamp = new Date(lastActiveAt);

  if (Number.isNaN(timestamp.getTime())) {
    return false;
  }

  if (timestamp.getTime() > now.getTime()) {
    return false;
  }

  return now.getTime() - timestamp.getTime() <= RECENTLY_ONLINE_WINDOW_HOURS * 60 * 60 * 1000;
}

export function formatLastActiveDate(lastActiveAt: string | null | undefined, locale?: string | string[]) {
  if (!lastActiveAt) {
    return 'Sin actividad reciente';
  }

  const timestamp = new Date(lastActiveAt);

  if (Number.isNaN(timestamp.getTime())) {
    return 'Sin actividad reciente';
  }

  return timestamp.toLocaleDateString(locale);
}

export function collectBlockedUserIds(rows: DiscoverMatchRow[], activeUserId: string) {
  const blockedUserIds = new Set<string>();

  for (const row of rows) {
    if (row.user_id === activeUserId) {
      blockedUserIds.add(row.target_user_id);
    }

    if (row.target_user_id === activeUserId) {
      blockedUserIds.add(row.user_id);
    }
  }

  return blockedUserIds;
}

export function collectExcludedDiscoverUserIds(rows: DiscoverMatchRow[], activeUserId: string) {
  const excludedUserIds = new Set<string>();

  for (const row of rows) {
    if (
      row.user_id === activeUserId &&
      (row.match_type === 'like' || row.match_type === 'super-like' || row.match_type === 'block')
    ) {
      excludedUserIds.add(row.target_user_id);
    }

    if (row.target_user_id === activeUserId && row.match_type === 'block') {
      excludedUserIds.add(row.user_id);
    }
  }

  return excludedUserIds;
}

export function excludeRowsFromBlockedUsers<T extends { user_id: string | null }>(
  rows: T[],
  blockedUserIds: ReadonlySet<string>
) {
  return rows.filter((row) => !row.user_id || !blockedUserIds.has(row.user_id));
}

export function buildDiscoverMatchInsert(
  userId: string,
  targetUserId: string,
  matchType: DiscoverPersistedMatchType
): DiscoverMatchInsert {
  // Discover persiste likes y blocks en `matches`.
  // El registro se identifica por la pareja única (user_id, target_user_id),
  // así que este payload sirve tanto para crear la acción inicial como para
  // registrar la acción inicial; si la acción cambia después, el cliente puede
  // reemplazar la fila previa por una nueva inserción para que el trigger SQL de
  // mutualidad siga evaluándose en el camino soportado por el schema.
  return {
    user_id: userId,
    target_user_id: targetUserId,
    match_type: matchType
  };
}

export function removeDiscoverProfile(profiles: DiscoverProfile[], profileId: string) {
  return profiles.filter((profile) => profile.id !== profileId);
}

export function excludeDiscoverProfilesById(
  profiles: DiscoverProfile[],
  excludedProfileIds: ReadonlySet<string>
) {
  return profiles.filter((profile) => !excludedProfileIds.has(profile.id));
}

export function buildDiscoverPassedProfilesStorageKey(userId: string) {
  return `${DISCOVER_PASSED_PROFILES_STORAGE_KEY_PREFIX}${userId}`;
}

export function parseDiscoverPassedProfileIds(value: string | null | undefined) {
  if (!value) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    );
  } catch {
    return new Set<string>();
  }
}

export function serializeDiscoverPassedProfileIds(profileIds: Iterable<string>) {
  return JSON.stringify(Array.from(new Set(profileIds)).sort());
}

export function applyDiscoverFilters(
  profiles: DiscoverProfile[],
  filters: DiscoverFilters,
  now = new Date()
) {
  const locationQuery = normalizeDiscoverText(filters.location);
  const interestQuery = normalizeDiscoverText(filters.interest);

  return profiles.filter((profile) => {
    const matchesLocation =
      !locationQuery || normalizeDiscoverText(profile.location ?? '').includes(locationQuery);
    const matchesInterest =
      !interestQuery ||
      (profile.interests ?? []).some((interest) => normalizeDiscoverText(interest).includes(interestQuery));
    const matchesIntent =
      !filters.relationshipIntent || profile.relationship_intent === filters.relationshipIntent;
    const matchesRecentActivity =
      !filters.onlineRecentlyOnly || isRecentlyOnline(profile.last_active_at, now);

    return matchesLocation && matchesInterest && matchesIntent && matchesRecentActivity;
  });
}

export function collectInterestOptions(profiles: DiscoverProfile[]) {
  const uniqueByNormalizedValue = new Map<string, string>();

  for (const interest of profiles.flatMap((profile) => profile.interests ?? [])) {
    const trimmed = interest.trim();
    const normalized = normalizeDiscoverText(trimmed);

    if (!trimmed || !normalized || uniqueByNormalizedValue.has(normalized)) {
      continue;
    }

    const displayValue = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    uniqueByNormalizedValue.set(normalized, displayValue);
  }

  return Array.from(uniqueByNormalizedValue.values()).sort((left, right) =>
    left.localeCompare(right, 'es', { sensitivity: 'base' })
  );
}
