import { describe, expect, it } from 'vitest';
import {
  MAX_POST_IMAGE_BYTES,
  MAX_POST_IMAGES,
  POST_IMAGES_BUCKET,
  buildPostImageObjectPath,
  buildPostStorageReference,
  getPostImageExtension,
  getRemainingPostImageSlots,
  normalizePostImageRefs,
  parsePostStorageReference,
  validatePostImageFile
} from './post-media';

describe('buildPostStorageReference / parsePostStorageReference', () => {
  it('serializes and parses supported post image references', () => {
    const reference = buildPostStorageReference(POST_IMAGES_BUCKET, 'user-1/posts/upload-123.webp');

    expect(reference).toBe('storage:post-images/user-1/posts/upload-123.webp');
    expect(parsePostStorageReference(reference)).toEqual({
      bucket: POST_IMAGES_BUCKET,
      path: 'user-1/posts/upload-123.webp'
    });
  });

  it('ignores malformed or unsupported references', () => {
    expect(parsePostStorageReference('https://example.com/image.png')).toBeNull();
    expect(parsePostStorageReference('storage:avatars/user-1/avatar.webp')).toBeNull();
    expect(parsePostStorageReference('storage:post-images')).toBeNull();
  });
});

describe('buildPostImageObjectPath', () => {
  it('builds deterministic image object paths from the user and upload id', () => {
    expect(buildPostImageObjectPath('user-1', 'foto.png', 'image/png', 'upload-123')).toBe(
      'user-1/posts/upload-123.png'
    );
    expect(buildPostImageObjectPath('user-1', 'foto', 'image/jpeg', 'upload-456')).toBe(
      'user-1/posts/upload-456.jpg'
    );
  });
});

describe('getPostImageExtension', () => {
  it('normalizes known mime types and falls back to a sanitized file extension', () => {
    expect(getPostImageExtension('photo.final.PNG', 'IMAGE/PNG')).toBe('png');
    expect(getPostImageExtension('photo.archive.we!bp', 'application/octet-stream')).toBe('webp');
    expect(getPostImageExtension('photo', 'application/octet-stream')).toBe('bin');
  });
});

describe('normalizePostImageRefs', () => {
  it('deduplicates, trims and respects the post image limit', () => {
    expect(
      normalizePostImageRefs([
        ' storage:post-images/user-1/posts/a.webp ',
        '',
        'storage:post-images/user-1/posts/a.webp',
        'storage:post-images/user-1/posts/b.webp',
        'storage:post-images/user-1/posts/c.webp',
        'storage:post-images/user-1/posts/d.webp',
        'storage:post-images/user-1/posts/e.webp'
      ])
    ).toEqual([
      'storage:post-images/user-1/posts/a.webp',
      'storage:post-images/user-1/posts/b.webp',
      'storage:post-images/user-1/posts/c.webp',
      'storage:post-images/user-1/posts/d.webp'
    ]);
  });

  it('reports the remaining post image slots up to the configured max', () => {
    expect(getRemainingPostImageSlots(0)).toBe(MAX_POST_IMAGES);
    expect(getRemainingPostImageSlots(2)).toBe(2);
    expect(getRemainingPostImageSlots(10)).toBe(0);
  });
});

describe('validatePostImageFile', () => {
  it('accepts supported image types within the size limit', () => {
    expect(validatePostImageFile({ name: 'photo.jpg', type: 'image/jpeg', size: MAX_POST_IMAGE_BYTES })).toEqual({
      valid: true,
      error: ''
    });
    expect(validatePostImageFile({ name: 'photo.png', type: 'IMAGE/PNG', size: 1024 })).toEqual({
      valid: true,
      error: ''
    });
    expect(validatePostImageFile({ name: 'photo.webp', type: 'image/webp', size: 1024 })).toEqual({
      valid: true,
      error: ''
    });
  });

  it('rejects unsupported mime types and oversize files', () => {
    expect(validatePostImageFile({ name: 'photo.gif', type: 'image/gif', size: 1024 })).toEqual({
      valid: false,
      error: 'Usa imágenes JPG, PNG o WEBP.'
    });
    expect(validatePostImageFile({ name: 'photo.png', type: 'image/png', size: MAX_POST_IMAGE_BYTES + 1 })).toEqual({
      valid: false,
      error: 'Cada imagen debe pesar 8 MB o menos.'
    });
  });
});
