import { supabase } from '$lib/supabase';
import {
  buildDiscoverMatchInsert,
  type DiscoverPersistedMatchType
} from '$lib/discover';
import type { Database } from '$lib/database.types';

export type SavedDiscoverMatch = Pick<
  Database['public']['Tables']['matches']['Row'],
  'id' | 'user_id' | 'target_user_id' | 'match_type' | 'is_mutual' | 'created_at'
>;

export async function saveDiscoverMatch(
  userId: string,
  targetUserId: string,
  matchType: DiscoverPersistedMatchType
) {
  const matchRecord = buildDiscoverMatchInsert(userId, targetUserId, matchType);

  // `upsert` mantiene la escritura atómica sobre la unique(user_id, target_user_id).
  // El trigger SQL ahora cubre inserts y updates de `match_type`, así que el cambio
  // de acción sigue reevaluando mutualidad sin abrir la ventana de carrera de un
  // delete+insert desde cliente.
  const { data, error } = await supabase
    .from('matches')
    .upsert(matchRecord, {
      onConflict: 'user_id,target_user_id'
    })
    .select('id, user_id, target_user_id, match_type, is_mutual, created_at')
    .single<SavedDiscoverMatch>();

  if (error) {
    throw error;
  }

  return data;
}
