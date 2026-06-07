export const PROFILE_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const AVATAR_BUCKET = 'avatars';
export const PROFILE_GALLERY_BUCKET = 'covers';
export const MAX_AVATAR_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_GALLERY_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PROFILE_GALLERY_IMAGES = 6;

const STORAGE_REFERENCE_PREFIX = 'storage:';
const allowedMimeTypes = new Set<string>(PROFILE_IMAGE_MIME_TYPES);

export type ProfileImageKind = 'avatar' | 'gallery';
export type ProfileStorageBucket = typeof AVATAR_BUCKET | typeof PROFILE_GALLERY_BUCKET;

export type FileLike = Pick<File, 'name' | 'size' | 'type'>;

export function buildStorageReference(bucket: ProfileStorageBucket, path: string) {
  return `${STORAGE_REFERENCE_PREFIX}${bucket}/${path}`;
}

export function parseStorageReference(value: string | null | undefined) {
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

  if (bucket !== AVATAR_BUCKET && bucket !== PROFILE_GALLERY_BUCKET) {
    return null;
  }

  return {
    bucket,
    path
  } satisfies { bucket: ProfileStorageBucket; path: string };
}

export function getProfileImageExtension(fileName: string, mimeType: string) {
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

  const extension = fileName.split('.').pop()?.trim().toLowerCase();
  return extension ? extension.replace(/[^a-z0-9]+/g, '') || 'bin' : 'bin';
}

export function buildAvatarObjectPath(userId: string, fileName: string, mimeType: string) {
  return `${userId}/avatar.${getProfileImageExtension(fileName, mimeType)}`;
}

export function buildGalleryObjectPath(
  userId: string,
  fileName: string,
  mimeType: string,
  uniqueSuffix: string
) {
  return `${userId}/gallery/${uniqueSuffix}.${getProfileImageExtension(fileName, mimeType)}`;
}

export function normalizeGalleryImageRefs(values: Array<string | null | undefined>, max = MAX_PROFILE_GALLERY_IMAGES) {
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

export function getRemainingGallerySlots(currentCount: number, max = MAX_PROFILE_GALLERY_IMAGES) {
  return Math.max(0, max - currentCount);
}

export function validateProfileImageFile(file: FileLike, kind: ProfileImageKind) {
  if (!allowedMimeTypes.has(file.type)) {
    return {
      valid: false,
      error: 'Usa una imagen JPG, PNG o WEBP.'
    } as const;
  }

  const maxBytes = kind === 'avatar' ? MAX_AVATAR_IMAGE_BYTES : MAX_GALLERY_IMAGE_BYTES;

  if (file.size > maxBytes) {
    const maxMegabytes = Math.floor(maxBytes / (1024 * 1024));

    return {
      valid: false,
      error:
        kind === 'avatar'
          ? `El avatar debe pesar ${maxMegabytes} MB o menos.`
          : `Cada foto de galería debe pesar ${maxMegabytes} MB o menos.`
    } as const;
  }

  return {
    valid: true,
    error: ''
  } as const;
}
