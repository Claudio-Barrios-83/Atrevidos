import { supabase } from '$lib/supabase/client';
import {
  POST_IMAGES_BUCKET,
  buildPostImageObjectPath,
  buildPostStorageReference,
  parsePostStorageReference
} from '$lib/post-media';

export async function resolvePostImageUrl(value: string | null | undefined, expiresIn = 60 * 60) {
  if (!value) {
    return null;
  }

  const storageReference = parsePostStorageReference(value);

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

export async function resolvePostImageUrls(values: Array<string | null | undefined>, expiresIn = 60 * 60) {
  const resolvedValues = await Promise.allSettled(values.map((value) => resolvePostImageUrl(value, expiresIn)));

  return resolvedValues.map((result) => (result.status === 'fulfilled' ? result.value : null));
}

export async function uploadPostImage(userId: string, file: File, uniqueSuffix: string) {
  const objectPath = buildPostImageObjectPath(userId, file.name, file.type, uniqueSuffix);

  const { error } = await supabase.storage.from(POST_IMAGES_BUCKET).upload(objectPath, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false
  });

  if (error) {
    throw error;
  }

  return buildPostStorageReference(POST_IMAGES_BUCKET, objectPath);
}

export async function deletePostImage(value: string | null | undefined) {
  const storageReference = parsePostStorageReference(value);

  if (!storageReference) {
    return;
  }

  const { error } = await supabase.storage.from(storageReference.bucket).remove([storageReference.path]);

  if (error) {
    throw error;
  }
}
