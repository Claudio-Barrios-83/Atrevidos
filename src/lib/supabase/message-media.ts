import { supabase } from '$lib/supabase/client';
import {
  MESSAGE_MEDIA_BUCKET,
  buildMessageMediaObjectPath,
  buildMessageMediaStorageReference,
  parseMessageMediaStorageReference
} from '$lib/message-media';

export async function resolveMessageMediaUrl(value: string | null | undefined, expiresIn = 60 * 60) {
  if (!value) {
    return null;
  }

  const storageReference = parseMessageMediaStorageReference(value);

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

export async function uploadMessageMedia(
  userId: string,
  conversationId: string,
  file: File,
  uniqueSuffix: string
) {
  const objectPath = buildMessageMediaObjectPath(userId, conversationId, file.name, file.type, uniqueSuffix);

  const { error } = await supabase.storage.from(MESSAGE_MEDIA_BUCKET).upload(objectPath, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false
  });

  if (error) {
    throw error;
  }

  return buildMessageMediaStorageReference(MESSAGE_MEDIA_BUCKET, objectPath);
}

export async function deleteMessageMedia(value: string | null | undefined) {
  const storageReference = parseMessageMediaStorageReference(value);

  if (!storageReference) {
    return;
  }

  const { error } = await supabase.storage.from(storageReference.bucket).remove([storageReference.path]);

  if (error) {
    throw error;
  }
}
