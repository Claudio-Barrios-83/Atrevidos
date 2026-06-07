import { describe, expect, it } from 'vitest';
import {
  AVATAR_BUCKET,
  MAX_AVATAR_IMAGE_BYTES,
  MAX_GALLERY_IMAGE_BYTES,
  MAX_PROFILE_GALLERY_IMAGES,
  PROFILE_GALLERY_BUCKET,
  buildAvatarObjectPath,
  buildGalleryObjectPath,
  buildStorageReference,
  getRemainingGallerySlots,
  normalizeGalleryImageRefs,
  parseStorageReference,
  validateProfileImageFile
} from './media';

describe('buildStorageReference / parseStorageReference', () => {
  it('serializes and parses supported bucket references', () => {
    const reference = buildStorageReference(AVATAR_BUCKET, 'user-1/avatar.webp');

    expect(reference).toBe('storage:avatars/user-1/avatar.webp');
    expect(parseStorageReference(reference)).toEqual({
      bucket: AVATAR_BUCKET,
      path: 'user-1/avatar.webp'
    });
  });

  it('ignores malformed or unsupported references', () => {
    expect(parseStorageReference('https://example.com/avatar.png')).toBeNull();
    expect(parseStorageReference('storage:unknown/file.png')).toBeNull();
    expect(parseStorageReference('storage:avatars')).toBeNull();
  });
});

describe('buildAvatarObjectPath / buildGalleryObjectPath', () => {
  it('builds deterministic avatar paths and unique gallery paths', () => {
    expect(buildAvatarObjectPath('user-1', 'foto.png', 'image/png')).toBe('user-1/avatar.png');
    expect(buildGalleryObjectPath('user-1', 'foto.webp', 'image/webp', 'gallery-123')).toBe(
      'user-1/gallery/gallery-123.webp'
    );
  });
});

describe('normalizeGalleryImageRefs', () => {
  it('deduplicates, trims and respects the gallery limit', () => {
    expect(
      normalizeGalleryImageRefs([
        ' storage:covers/user-1/gallery/a.webp ',
        '',
        'storage:covers/user-1/gallery/a.webp',
        'storage:covers/user-1/gallery/b.webp',
        'storage:covers/user-1/gallery/c.webp',
        'storage:covers/user-1/gallery/d.webp',
        'storage:covers/user-1/gallery/e.webp',
        'storage:covers/user-1/gallery/f.webp',
        'storage:covers/user-1/gallery/g.webp'
      ])
    ).toEqual([
      'storage:covers/user-1/gallery/a.webp',
      'storage:covers/user-1/gallery/b.webp',
      'storage:covers/user-1/gallery/c.webp',
      'storage:covers/user-1/gallery/d.webp',
      'storage:covers/user-1/gallery/e.webp',
      'storage:covers/user-1/gallery/f.webp'
    ]);
  });

  it('reports the remaining gallery slots up to the configured max', () => {
    expect(getRemainingGallerySlots(0)).toBe(MAX_PROFILE_GALLERY_IMAGES);
    expect(getRemainingGallerySlots(2)).toBe(4);
    expect(getRemainingGallerySlots(10)).toBe(0);
  });
});

describe('validateProfileImageFile', () => {
  it('accepts supported avatar and gallery image types within the size limit', () => {
    expect(
      validateProfileImageFile({ name: 'avatar.jpg', type: 'image/jpeg', size: MAX_AVATAR_IMAGE_BYTES }, 'avatar')
    ).toEqual({ valid: true, error: '' });
    expect(
      validateProfileImageFile(
        { name: 'gallery.webp', type: 'image/webp', size: MAX_GALLERY_IMAGE_BYTES },
        'gallery'
      )
    ).toEqual({ valid: true, error: '' });
  });

  it('rejects unsupported mime types and oversize files', () => {
    expect(validateProfileImageFile({ name: 'avatar.gif', type: 'image/gif', size: 1024 }, 'avatar')).toEqual({
      valid: false,
      error: 'Usa una imagen JPG, PNG o WEBP.'
    });
    expect(
      validateProfileImageFile(
        { name: 'avatar.png', type: 'image/png', size: MAX_AVATAR_IMAGE_BYTES + 1 },
        'avatar'
      )
    ).toEqual({
      valid: false,
      error: 'El avatar debe pesar 5 MB o menos.'
    });
    expect(
      validateProfileImageFile(
        { name: 'gallery.png', type: 'image/png', size: MAX_GALLERY_IMAGE_BYTES + 1 },
        'gallery'
      )
    ).toEqual({
      valid: false,
      error: 'Cada foto de galería debe pesar 8 MB o menos.'
    });
  });
});
