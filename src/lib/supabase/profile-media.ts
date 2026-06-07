import { supabase } from '$lib/supabase/client';
import type { Database } from '$lib/database.types';
import {
  AVATAR_BUCKET,
  PROFILE_GALLERY_BUCKET,
  buildAvatarObjectPath,
  buildGalleryObjectPath,
  buildStorageReference,
  normalizeGalleryImageRefs,
  parseStorageReference
} from '$lib/profile/media';

type ProfileMediaUpdate = Pick<
  Database['public']['Tables']['profiles']['Update'],
  'avatar_url' | 'gallery_urls'
>;

export async function resolveStorageImageUrl(value: string | null | undefined, expiresIn = 60 * 60) {
  if (!value) {
    return null;
  }

  const storageReference = parseStorageReference(value);

  if (!storageReference) {
    return value;
  }

  const { data, error } = await supabase.storage
    .from(storageReference.bucket)
    .createSignedUrl(storageReference.path, expiresIn);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

export async function resolveStorageImageUrls(values: Array<string | null | undefined>, expiresIn = 60 * 60) {
  return Promise.all(values.map((value) => resolveStorageImageUrl(value, expiresIn)));
}

export async function uploadAvatarImage(userId: string, file: File) {
  const objectPath = buildAvatarObjectPath(userId, file.name, file.type);

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(objectPath, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: true
  });

  if (error) {
    throw error;
  }

  return buildStorageReference(AVATAR_BUCKET, objectPath);
}

export async function uploadGalleryImage(userId: string, file: File, uniqueSuffix: string) {
  const objectPath = buildGalleryObjectPath(userId, file.name, file.type, uniqueSuffix);

  const { error } = await supabase.storage.from(PROFILE_GALLERY_BUCKET).upload(objectPath, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false
  });

  if (error) {
    throw error;
  }

  return buildStorageReference(PROFILE_GALLERY_BUCKET, objectPath);
}

export async function deleteStorageObject(value: string | null | undefined) {
  const storageReference = parseStorageReference(value);

  if (!storageReference) {
    return;
  }

  const { error } = await supabase.storage.from(storageReference.bucket).remove([storageReference.path]);

  if (error) {
    throw error;
  }
}

export async function updateProfileMedia(userId: string, updates: ProfileMediaUpdate) {
  const payload: ProfileMediaUpdate = {};

  if ('avatar_url' in updates) {
    payload.avatar_url = updates.avatar_url ?? null;
  }

  if ('gallery_urls' in updates) {
    payload.gallery_urls = normalizeGalleryImageRefs(updates.gallery_urls ?? []);
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select(
      'id, username, display_name, bio, avatar_url, gallery_urls, location, interests, relationship_intent, relationship_preferences, consent_acknowledged, age_confirmed, onboarding_completed_at'
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}
