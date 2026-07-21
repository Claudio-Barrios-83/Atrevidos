export const MESSAGE_MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MESSAGE_MEDIA_BUCKET = 'media-chats';
export const MAX_MESSAGE_MEDIA_BYTES = 8 * 1024 * 1024;

const STORAGE_REFERENCE_PREFIX = 'storage:';
const allowedMimeTypes = new Set<string>(MESSAGE_MEDIA_MIME_TYPES);

export type MessageMediaFileLike = Pick<File, 'name' | 'size' | 'type'>;
export type MessageMediaStorageBucket = typeof MESSAGE_MEDIA_BUCKET;

export function buildMessageMediaStorageReference(bucket: MessageMediaStorageBucket, path: string) {
  return `${STORAGE_REFERENCE_PREFIX}${bucket}/${path}`;
}

export function parseMessageMediaStorageReference(value: string | null | undefined) {
  if (!value?.startsWith(STORAGE_REFERENCE_PREFIX)) {
    return null;
  }

  const reference = value.slice(STORAGE_REFERENCE_PREFIX.length);
  const separatorIndex = reference.indexOf('/');

  if (separatorIndex <= 0 || separatorIndex === reference.length - 1) {
    return null;
  }

  const bucket = reference.slice(0, separatorIndex);
  const path = reference.slice(separatorIndex + 1);

  if (bucket !== MESSAGE_MEDIA_BUCKET) {
    return null;
  }

  return {
    bucket,
    path
  } satisfies { bucket: MessageMediaStorageBucket; path: string };
}

export function getMessageMediaExtension(fileName: string, mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase();

  if (normalizedMimeType === 'image/jpeg') return 'jpg';
  if (normalizedMimeType === 'image/png') return 'png';
  if (normalizedMimeType === 'image/webp') return 'webp';
  if (normalizedMimeType === 'image/gif') return 'gif';

  const extension = fileName.includes('.') ? fileName.split('.').pop()?.trim().toLowerCase() : '';
  return extension ? extension.replace(/[^a-z0-9]+/g, '') || 'bin' : 'bin';
}

export function buildMessageMediaObjectPath(
  userId: string,
  conversationId: string,
  fileName: string,
  mimeType: string,
  uniqueSuffix: string
) {
  return `${userId}/chats/${conversationId}/${uniqueSuffix}.${getMessageMediaExtension(fileName, mimeType)}`;
}

export function validateMessageMediaFile(file: MessageMediaFileLike) {
  const normalizedMimeType = file.type.toLowerCase();

  if (!allowedMimeTypes.has(normalizedMimeType)) {
    return {
      valid: false,
      error: 'Usa imágenes JPG, PNG, WEBP o GIF.'
    } as const;
  }

  if (file.size > MAX_MESSAGE_MEDIA_BYTES) {
    return {
      valid: false,
      error: 'La imagen debe pesar 8 MB o menos.'
    } as const;
  }

  return {
    valid: true,
    error: ''
  } as const;
}
