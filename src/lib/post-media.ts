export const POST_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const POST_IMAGES_BUCKET = 'post-images';
export const MAX_POST_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_POST_IMAGES = 4;

const STORAGE_REFERENCE_PREFIX = 'storage:';
const allowedMimeTypes = new Set<string>(POST_IMAGE_MIME_TYPES);

export type FileLike = Pick<File, 'name' | 'size' | 'type'>;
export type PostStorageBucket = typeof POST_IMAGES_BUCKET;

export function buildPostStorageReference(bucket: PostStorageBucket, path: string) {
  return `${STORAGE_REFERENCE_PREFIX}${bucket}/${path}`;
}

export function parsePostStorageReference(value: string | null | undefined) {
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

  if (bucket !== POST_IMAGES_BUCKET) {
    return null;
  }

  return {
    bucket,
    path
  } satisfies { bucket: PostStorageBucket; path: string };
}

export function getPostImageExtension(fileName: string, mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase();

  if (normalizedMimeType === 'image/jpeg') {
    return 'jpg';
  }

  if (normalizedMimeType === 'image/png') {
    return 'png';
  }

  if (normalizedMimeType === 'image/webp') {
    return 'webp';
  }

  const extension = fileName.includes('.') ? fileName.split('.').pop()?.trim().toLowerCase() : '';
  return extension ? extension.replace(/[^a-z0-9]+/g, '') || 'bin' : 'bin';
}

export function buildPostImageObjectPath(userId: string, fileName: string, mimeType: string, uniqueSuffix: string) {
  return `${userId}/posts/${uniqueSuffix}.${getPostImageExtension(fileName, mimeType)}`;
}

export function normalizePostImageRefs(values: Array<string | null | undefined>, max = MAX_POST_IMAGES) {
  const uniqueValues = new Set<string>();

  for (const value of values) {
    const normalized = value?.trim();

    if (normalized) {
      uniqueValues.add(normalized);
    }

    if (uniqueValues.size >= max) {
      break;
    }
  }

  return Array.from(uniqueValues);
}

export function getRemainingPostImageSlots(currentCount: number, max = MAX_POST_IMAGES) {
  return Math.max(0, max - currentCount);
}

export function validatePostImageFile(file: FileLike) {
  const normalizedMimeType = file.type.toLowerCase();

  if (!allowedMimeTypes.has(normalizedMimeType)) {
    return {
      valid: false,
      error: 'Usa imágenes JPG, PNG o WEBP.'
    } as const;
  }

  if (file.size > MAX_POST_IMAGE_BYTES) {
    return {
      valid: false,
      error: 'Cada imagen debe pesar 8 MB o menos.'
    } as const;
  }

  return {
    valid: true,
    error: ''
  } as const;
}
