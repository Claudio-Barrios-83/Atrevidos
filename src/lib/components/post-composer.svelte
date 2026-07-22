<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { auth } from '$lib';
  import { supabase } from '$lib/supabase/client';
  import { deletePostImage, uploadPostImage } from '$lib/supabase/post-media';
  import {
    MAX_POST_IMAGES,
    POST_IMAGE_MIME_TYPES,
    getRemainingPostImageSlots,
    normalizePostImageRefs,
    validatePostImageFile
  } from '$lib/post-media';
  import type { Database } from '$lib/database.types';

  // Componente autocontenido: dueño de todo su propio estado de "nueva
  // publicación" (texto, imágenes, visibilidad, anónimo). Cuando publica con
  // éxito, avisa al feed padre vía el evento "published" para que recargue.
  const dispatch = createEventDispatcher<{ published: void }>();

  type SelectedPostImage = {
    id: string;
    file: File;
    previewUrl: string;
  };

  const POST_IMAGE_ACCEPT = POST_IMAGE_MIME_TYPES.join(',');

  let newPostContent = '';
  let postImageInput: HTMLInputElement | null = null;
  let selectedPostImages: SelectedPostImage[] = [];
  let publishing = false;
  let composeError = '';
  let composeSuccess = '';
  let postAnonymous = false;
  let postVisibility: 'public' | 'followers' = 'public';

  $: selectedPostImageCount = selectedPostImages.length;
  $: remainingPostImageSlots = getRemainingPostImageSlots(selectedPostImageCount);

  function buildPostImageUploadId(index: number) {
    const randomPart =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    return `${Date.now()}-${index}-${randomPart}`;
  }

  function revokeSelectedPostImagePreviews(images: SelectedPostImage[]) {
    for (const image of images) {
      URL.revokeObjectURL(image.previewUrl);
    }
  }

  function replaceSelectedPostImages(nextImages: SelectedPostImage[]) {
    revokeSelectedPostImagePreviews(selectedPostImages);
    selectedPostImages = nextImages;
  }

  function clearSelectedPostImages() {
    replaceSelectedPostImages([]);

    if (postImageInput) {
      postImageInput.value = '';
    }
  }

  function removeSelectedPostImage(imageId: string) {
    const imageToRemove = selectedPostImages.find((image) => image.id === imageId);

    if (!imageToRemove || publishing) {
      return;
    }

    URL.revokeObjectURL(imageToRemove.previewUrl);
    selectedPostImages = selectedPostImages.filter((image) => image.id !== imageId);
    composeError = '';
    composeSuccess = '';

    if (postImageInput) {
      postImageInput.value = '';
    }
  }

  function validateSelectedPostImages(images: File[]) {
    for (const file of images) {
      const validation = validatePostImageFile(file);

      if (!validation.valid) {
        return validation;
      }
    }

    return { valid: true, error: '' } as const;
  }

  function handlePostImagesChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    composeError = '';
    composeSuccess = '';

    if (files.length === 0) {
      return;
    }

    if (files.length > remainingPostImageSlots) {
      composeError = `Puedes adjuntar hasta ${MAX_POST_IMAGES} imágenes por publicación.`;
      input.value = '';
      return;
    }

    const validation = validateSelectedPostImages(files);

    if (!validation.valid) {
      composeError = validation.error;
      input.value = '';
      return;
    }

    selectedPostImages = [
      ...selectedPostImages,
      ...files.map((file, index) => ({
        id: buildPostImageUploadId(selectedPostImages.length + index),
        file,
        previewUrl: URL.createObjectURL(file)
      }))
    ];
    input.value = '';
  }

  async function createPost() {
    if (publishing) return;

    const content = newPostContent.trim();
    const user = $auth.user;

    if (!user) {
      composeError = 'Tu sesión expiró. Vuelve a iniciar sesión para publicar.';
      composeSuccess = '';
      return;
    }

    if (!content && selectedPostImages.length === 0) {
      composeError = 'Escribe algo o adjunta al menos una imagen antes de publicar.';
      composeSuccess = '';
      return;
    }

    if (selectedPostImages.length > MAX_POST_IMAGES) {
      composeError = `Puedes adjuntar hasta ${MAX_POST_IMAGES} imágenes por publicación.`;
      composeSuccess = '';
      return;
    }

    const validation = validateSelectedPostImages(selectedPostImages.map((image) => image.file));

    if (!validation.valid) {
      composeError = validation.error;
      composeSuccess = '';
      return;
    }

    publishing = true;
    composeError = '';
    composeSuccess = '';
    const uploadedImageRefs: string[] = [];

    try {
      for (const [index, image] of selectedPostImages.entries()) {
        const uploadedImageRef = await uploadPostImage(user.id, image.file, buildPostImageUploadId(index));
        uploadedImageRefs.push(uploadedImageRef);
      }

      const post = {
        user_id: user.id,
        content,
        image_urls: normalizePostImageRefs(uploadedImageRefs),
        visibility: postVisibility,
        is_anonymous: postAnonymous,
        is_archived: false
      } satisfies Database['public']['Tables']['posts']['Insert'];

      const { error } = await supabase.from('posts').insert([post]);

      if (error) {
        throw error;
      }

      newPostContent = '';
      postAnonymous = false;
      postVisibility = 'public';
      clearSelectedPostImages();
      composeSuccess = 'Publicación creada correctamente.';
      dispatch('published');
    } catch (error) {
      await Promise.allSettled(uploadedImageRefs.map((reference) => deletePostImage(reference)));
      console.error('Error creating post:', error);
      composeError = 'No pudimos publicar tu mensaje o subir sus imágenes. Inténtalo de nuevo.';
    } finally {
      publishing = false;
    }
  }

  onDestroy(() => {
    revokeSelectedPostImagePreviews(selectedPostImages);
  });
</script>

<section class="mb-6 rounded-2xl bg-dark-800/70 p-4 shadow-lg shadow-black/30 ring-1 ring-white/10 backdrop-blur-sm">
  <label class="sr-only" for="new-post">Nueva publicación</label>
  <textarea
    id="new-post"
    bind:value={newPostContent}
    placeholder="¿Qué estás pensando?"
    class="w-full resize-none rounded-lg border p-3 outline-none focus:ring-2 focus:ring-primary-500 border-gray-700 bg-gray-900 text-white"
    rows="3"
    disabled={publishing}
    maxlength="500"
  ></textarea>

  <div class="mt-3 flex flex-wrap items-center gap-4">
    <label class="flex items-center gap-2 text-sm text-gray-300">
      <input
        type="checkbox"
        bind:checked={postAnonymous}
        disabled={publishing}
        class="h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-600"
      />
      Publicar de forma anónima
    </label>

    <label class="flex items-center gap-2 text-sm text-gray-300">
      <span>Visible para:</span>
      <select
        bind:value={postVisibility}
        disabled={publishing}
        class="rounded-lg border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary-500 border-gray-600 bg-gray-900 text-gray-100"
      >
        <option value="public">Todo el mundo</option>
        <option value="followers">Solo mis conexiones (matches)</option>
      </select>
    </label>
  </div>

  <div class="mt-4 rounded-xl border border-dashed p-4 border-gray-700 bg-gray-900">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-sm font-medium text-white">Imágenes para la publicación</p>
        <p class="mt-1 text-xs text-gray-400">
          Adjunta hasta {MAX_POST_IMAGES} imágenes JPG, PNG o WEBP de 8 MB o menos por archivo.
        </p>
      </div>

      <input
        bind:this={postImageInput}
        type="file"
        accept={POST_IMAGE_ACCEPT}
        multiple
        class="hidden"
        disabled={publishing || remainingPostImageSlots === 0}
        on:change={handlePostImagesChange}
      />

      <button
        type="button"
        on:click={() => postImageInput?.click()}
        disabled={publishing || remainingPostImageSlots === 0}
        class="rounded-lg border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 border-gray-600 text-gray-200 hover:bg-gray-800"
      >
        {#if remainingPostImageSlots === 0}Límite alcanzado{:else}Añadir imágenes{/if}
      </button>
    </div>

    {#if selectedPostImages.length > 0}
      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {#each selectedPostImages as image (image.id)}
          <article class="overflow-hidden rounded-xl border shadow-sm border-gray-700 bg-gray-800">
            <img src={image.previewUrl} alt={image.file.name} class="h-28 w-full object-cover" />
            <div class="space-y-2 p-3">
              <p class="line-clamp-2 text-xs text-gray-400">{image.file.name}</p>
              <button
                type="button"
                on:click={() => removeSelectedPostImage(image.id)}
                disabled={publishing}
                class="w-full rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 border-red-900/60 text-red-300 hover:bg-red-950/30"
              >
                Quitar
              </button>
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <p class="mt-4 text-xs text-gray-400">Aún no has seleccionado imágenes para esta publicación.</p>
    {/if}
  </div>

  <div class="mt-4 flex items-center justify-between gap-3">
    <p class="text-xs text-gray-400">
      {newPostContent.trim().length}/500 caracteres · {selectedPostImageCount}/{MAX_POST_IMAGES} imágenes
    </p>

    <button
      type="button"
      on:click={createPost}
      disabled={publishing || (!newPostContent.trim() && selectedPostImages.length === 0)}
      class="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {#if publishing}
        <div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
        Publicando...
      {:else}
        Publicar
      {/if}
    </button>
  </div>

  {#if composeError}
    <p class="mt-3 rounded-lg px-3 py-2 text-sm bg-red-950/40 text-red-300">
      {composeError}
    </p>
  {/if}

  {#if composeSuccess}
    <p class="mt-3 rounded-lg px-3 py-2 text-sm bg-green-950/40 text-green-300">
      {composeSuccess}
    </p>
  {/if}
</section>
