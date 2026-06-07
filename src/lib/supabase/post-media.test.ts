import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUrl = vi.fn();

vi.mock('$lib/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl
      }))
    }
  }
}));

import { POST_IMAGES_BUCKET, buildPostStorageReference } from '$lib/post-media';
import { resolvePostImageUrl, resolvePostImageUrls } from './post-media';

describe('resolvePostImageUrl', () => {
  beforeEach(() => {
    createSignedUrl.mockReset();
  });

  it('returns plain URLs unchanged and skips signed URL resolution', async () => {
    const url = 'https://cdn.example.com/post-1.png';

    await expect(resolvePostImageUrl(url)).resolves.toBe(url);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('creates a signed URL for storage references', async () => {
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/post-1.png' },
      error: null
    });

    await expect(
      resolvePostImageUrl(buildPostStorageReference(POST_IMAGES_BUCKET, 'user-1/posts/post-1.png'), 120)
    ).resolves.toBe('https://signed.example.com/post-1.png');

    expect(createSignedUrl).toHaveBeenCalledWith('user-1/posts/post-1.png', 120);
  });
});

describe('resolvePostImageUrls', () => {
  beforeEach(() => {
    createSignedUrl.mockReset();
  });

  it('preserves input order and degrades only the failed image to null', async () => {
    createSignedUrl
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://signed.example.com/post-1.png' },
        error: null
      })
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://signed.example.com/post-3.webp' },
        error: null
      });

    const result = await resolvePostImageUrls([
      buildPostStorageReference(POST_IMAGES_BUCKET, 'user-1/posts/post-1.png'),
      null,
      'https://cdn.example.com/post-2.png',
      buildPostStorageReference(POST_IMAGES_BUCKET, 'user-1/posts/post-3.webp')
    ]);

    expect(result).toEqual([
      'https://signed.example.com/post-1.png',
      null,
      'https://cdn.example.com/post-2.png',
      'https://signed.example.com/post-3.webp'
    ]);
  });

  it('returns null only for the storage item whose signed URL lookup fails', async () => {
    createSignedUrl
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://signed.example.com/post-1.png' },
        error: null
      })
      .mockResolvedValueOnce({
        data: { signedUrl: '' },
        error: new Error('storage timeout')
      })
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://signed.example.com/post-3.webp' },
        error: null
      });

    const result = await resolvePostImageUrls([
      buildPostStorageReference(POST_IMAGES_BUCKET, 'user-1/posts/post-1.png'),
      buildPostStorageReference(POST_IMAGES_BUCKET, 'user-1/posts/post-2.png'),
      buildPostStorageReference(POST_IMAGES_BUCKET, 'user-1/posts/post-3.webp')
    ]);

    expect(result).toEqual([
      'https://signed.example.com/post-1.png',
      null,
      'https://signed.example.com/post-3.webp'
    ]);
    expect(createSignedUrl).toHaveBeenCalledTimes(3);
  });
});
