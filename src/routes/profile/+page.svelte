<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    buildProfileFormValues,
    EMPTY_ONBOARDING_FORM,
    invalidateOnboardingState,
    loadOnboardingState,
    normalizeUsername,
    RELATIONSHIP_INTENT_OPTIONS,
    saveProfile,
    type ProfileFormValues,
    type ProfileRow
  } from '$lib/onboarding';
  import {
    getRemainingGallerySlots,
    MAX_PROFILE_GALLERY_IMAGES,
    normalizeGalleryImageRefs,
    validateProfileImageFile
  } from '$lib/profile/media';
  import { auth } from '$lib/stores/auth';
  import {
    deleteStorageObject,
    resolveStorageImageUrl,
    resolveStorageImageUrls,
    updateProfileMedia,
    uploadAvatarImage,
    uploadGalleryImage
  } from '$lib/supabase/profile-media';

  const PROFILE_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

  let form: ProfileFormValues = { ...EMPTY_ONBOARDING_FORM };
  let profile: ProfileRow | null = null;
  let loading = true;
  let saving = false;
  let loadFailed = false;
  let initializedForUserId: string | null = null;
  let error = '';
  let success = '';

  let avatarPreviewUrl: string | null = null;
  let galleryPreviewUrls: string[] = [];
  let mediaLoadError = '';
  let avatarUploading = false;
  let galleryUploading = false;
  let removingGalleryIndex: number | null = null;
  let avatarError = '';
  let avatarSuccess = '';
  let galleryError = '';
  let gallerySuccess = '';
  let avatarInput: HTMLInputElement | null = null;
  let galleryInput: HTMLInputElement | null = null;
  let latestMediaRequest = 0;

  $: authState = $auth;
  $: formBusy = saving || avatarUploading || galleryUploading || removingGalleryIndex !== null;
  $: currentGalleryRefs = profile?.gallery_urls ?? [];
  $: remainingGallerySlots = getRemainingGallerySlots(currentGalleryRefs.length);
  $: profileInitial = (profile?.display_name?.trim()?.[0] || profile?.username?.trim()?.[0] || 'U').toUpperCase();

  function resetMediaState() {
    avatarPreviewUrl = null;
    galleryPreviewUrls = [];
    mediaLoadError = '';
    avatarUploading = false;
    galleryUploading = false;
    removingGalleryIndex = null;
    avatarError = '';
    avatarSuccess = '';
    galleryError = '';
    gallerySuccess = '';
  }

  function clearMediaFeedback() {
    avatarError = '';
    avatarSuccess = '';
    galleryError = '';
    gallerySuccess = '';
    mediaLoadError = '';
  }

  async function refreshMediaPreviews(nextProfile: ProfileRow | null) {
    const requestId = ++latestMediaRequest;

    if (!nextProfile) {
      avatarPreviewUrl = null;
      galleryPreviewUrls = [];
      mediaLoadError = '';
      return;
    }

    try {
      const [resolvedAvatarUrl, resolvedGalleryUrls] = await Promise.all([
        resolveStorageImageUrl(nextProfile.avatar_url),
        resolveStorageImageUrls(nextProfile.gallery_urls ?? [])
      ]);

      if (requestId !== latestMediaRequest) {
        return;
      }

      avatarPreviewUrl = resolvedAvatarUrl;
      galleryPreviewUrls = resolvedGalleryUrls.map((url, index) => url ?? nextProfile.gallery_urls[index]).filter(Boolean) as string[];
      mediaLoadError = '';
    } catch (err) {
      if (requestId !== latestMediaRequest) {
        return;
      }

      console.error('Error resolviendo previews de perfil:', err);
      avatarPreviewUrl = null;
      galleryPreviewUrls = [];
      mediaLoadError =
        'No pudimos cargar alguna imagen privada del perfil. Verifica buckets/políticas de Supabase Storage.';
    }
  }

  async function applyProfileMediaUpdates(
    updates: Parameters<typeof updateProfileMedia>[1],
    options: { deleteAfterSave?: string | null } = {}
  ) {
    const user = authState.user;

    if (!user) {
      throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    }

    const updatedProfile = (await updateProfileMedia(user.id, updates)) as ProfileRow;

    profile = updatedProfile;
    initializedForUserId = user.id;
    invalidateOnboardingState();
    await refreshMediaPreviews(updatedProfile);

    if (options.deleteAfterSave) {
      try {
        await deleteStorageObject(options.deleteAfterSave);
      } catch (cleanupError) {
        console.warn('No se pudo limpiar un archivo antiguo de Storage:', cleanupError);
      }
    }

    return updatedProfile;
  }

  function buildGalleryUploadId(index: number) {
    const randomPart =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    return `${Date.now()}-${index}-${randomPart}`;
  }

  $: if (authState.initialized && !authState.user) {
    form = { ...EMPTY_ONBOARDING_FORM };
    profile = null;
    loading = false;
    saving = false;
    loadFailed = false;
    initializedForUserId = null;
    error = '';
    success = '';
    resetMediaState();
  }

  $: if (authState.initialized && authState.user && initializedForUserId !== authState.user.id && !loading && !saving) {
    void hydrateProfile(authState.user.id);
  }

  $: if (authState.initialized && authState.user && initializedForUserId === null && loading && !saving) {
    void hydrateProfile(authState.user.id);
  }

  async function hydrateProfile(expectedUserId?: string) {
    const user = authState.user;

    if (!user) {
      form = { ...EMPTY_ONBOARDING_FORM };
      profile = null;
      loading = false;
      initializedForUserId = null;
      loadFailed = false;
      resetMediaState();
      return;
    }

    if (expectedUserId && user.id !== expectedUserId) {
      return;
    }

    loading = true;
    loadFailed = false;
    error = '';
    success = '';
    clearMediaFeedback();

    try {
      const state = await loadOnboardingState(user);

      if (authState.user?.id !== user.id) {
        return;
      }

      if (!state.isComplete) {
        await goto('/onboarding', { replaceState: true });
        return;
      }

      profile = state.profile;
      form = buildProfileFormValues(state.profile);
      initializedForUserId = user.id;
      await refreshMediaPreviews(state.profile);
    } catch (err) {
      console.error('Error cargando perfil:', err);
      loadFailed = true;
      profile = null;
      initializedForUserId = null;
      error = 'No pudimos cargar tu perfil. Reinténtalo.';
      resetMediaState();
    } finally {
      if (authState.user?.id === user?.id) {
        loading = false;
      }
    }
  }

  async function retryLoad() {
    if (loading || formBusy || !authState.user) return;
    await hydrateProfile(authState.user.id);
  }

  async function handleSubmit() {
    if (formBusy || loading || loadFailed) return;

    const user = authState.user;

    if (!user) {
      error = 'Tu sesión expiró. Vuelve a iniciar sesión.';
      success = '';
      return;
    }

    saving = true;
    error = '';
    success = '';
    form = {
      ...form,
      username: normalizeUsername(form.username)
    };

    try {
      const savedProfile = await saveProfile(user, form, {
        preserveOnboardingCompletion: true,
        requireAcknowledgements: true,
        currentProfile: profile
      });

      profile = savedProfile;
      form = buildProfileFormValues(savedProfile);
      initializedForUserId = user.id;
      success = 'Tu perfil se guardó correctamente.';
      await refreshMediaPreviews(savedProfile);
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : '';

      if (message.includes('duplicate key') || message.includes('profiles_username_key')) {
        error = 'Ese nombre de usuario ya está en uso. Elige otro.';
      } else {
        error = err instanceof Error ? err.message : 'No pudimos guardar tus cambios. Inténtalo de nuevo.';
      }
    } finally {
      saving = false;
    }
  }

  async function handleAvatarChange(event: Event) {
    const user = authState.user;
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];

    avatarError = '';
    avatarSuccess = '';

    if (!user || !profile) {
      avatarError = 'Necesitas una sesión activa para actualizar tu avatar.';
      input.value = '';
      return;
    }

    if (!file) {
      return;
    }

    const validation = validateProfileImageFile(file, 'avatar');

    if (!validation.valid) {
      avatarError = validation.error;
      input.value = '';
      return;
    }

    avatarUploading = true;

    const previousAvatarRef = profile.avatar_url;
    let uploadedAvatarRef: string | null = null;

    try {
      uploadedAvatarRef = await uploadAvatarImage(user.id, file);
      await applyProfileMediaUpdates(
        { avatar_url: uploadedAvatarRef },
        {
          deleteAfterSave:
            previousAvatarRef && previousAvatarRef !== uploadedAvatarRef ? previousAvatarRef : null
        }
      );
      avatarSuccess = 'Avatar actualizado correctamente.';
    } catch (err) {
      if (uploadedAvatarRef && uploadedAvatarRef !== previousAvatarRef) {
        await Promise.allSettled([deleteStorageObject(uploadedAvatarRef)]);
      }

      console.error('Error subiendo avatar:', err);
      avatarError = 'No pudimos subir tu avatar. Revisa los buckets/políticas y vuelve a intentarlo.';
    } finally {
      avatarUploading = false;
      input.value = '';
    }
  }

  async function handleGalleryChange(event: Event) {
    const user = authState.user;
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    galleryError = '';
    gallerySuccess = '';

    if (!user || !profile) {
      galleryError = 'Necesitas una sesión activa para actualizar tu galería.';
      input.value = '';
      return;
    }

    if (files.length === 0) {
      return;
    }

    if (files.length > remainingGallerySlots) {
      galleryError = `Solo te quedan ${remainingGallerySlots} espacios disponibles en la galería.`;
      input.value = '';
      return;
    }

    for (const file of files) {
      const validation = validateProfileImageFile(file, 'gallery');

      if (!validation.valid) {
        galleryError = validation.error;
        input.value = '';
        return;
      }
    }

    galleryUploading = true;
    const uploadedRefs: string[] = [];

    try {
      for (const [index, file] of files.entries()) {
        const uploadedRef = await uploadGalleryImage(user.id, file, buildGalleryUploadId(index));
        uploadedRefs.push(uploadedRef);
      }

      const nextGalleryRefs = normalizeGalleryImageRefs([...(profile.gallery_urls ?? []), ...uploadedRefs]);
      await applyProfileMediaUpdates({ gallery_urls: nextGalleryRefs });
      gallerySuccess =
        files.length === 1 ? 'La foto se añadió a tu galería.' : `${files.length} fotos añadidas a tu galería.`;
    } catch (err) {
      console.error('Error subiendo imágenes de galería:', err);
      galleryError = 'No pudimos subir una o más fotos de la galería. Inténtalo de nuevo.';
      await Promise.allSettled(uploadedRefs.map((reference) => deleteStorageObject(reference)));
    } finally {
      galleryUploading = false;
      input.value = '';
    }
  }

  async function removeGalleryImage(index: number) {
    if (!profile || removingGalleryIndex !== null) {
      return;
    }

    const galleryRefToRemove = profile.gallery_urls[index];

    if (!galleryRefToRemove) {
      return;
    }

    removingGalleryIndex = index;
    galleryError = '';
    gallerySuccess = '';

    try {
      const nextGalleryRefs = profile.gallery_urls.filter((_, currentIndex) => currentIndex !== index);
      await applyProfileMediaUpdates({ gallery_urls: nextGalleryRefs }, { deleteAfterSave: galleryRefToRemove });
      gallerySuccess = 'La foto se eliminó de tu galería.';
    } catch (err) {
      console.error('Error eliminando imagen de galería:', err);
      galleryError = 'No pudimos eliminar esta imagen de la galería. Inténtalo de nuevo.';
    } finally {
      removingGalleryIndex = null;
    }
  }
</script>

{#if !authState.initialized || loading}
  <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
    <div class="text-center">
      <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Cargando tu perfil…</p>
    </div>
  </div>
{:else if !authState.user}
  <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
    <div class="text-center">
      <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Redirigiendo…</p>
    </div>
  </div>
{:else if loadFailed}
  <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-6 dark:bg-gray-900">
    <div class="w-full max-w-lg rounded-2xl bg-white p-6 text-center shadow-lg dark:bg-gray-800">
      <p class="text-sm font-medium uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Mi perfil</p>
      <h1 class="mt-3 text-2xl font-bold text-gray-900 dark:text-white">No pudimos cargar tu perfil</h1>
      <p class="mt-3 text-sm text-gray-600 dark:text-gray-400">
        Puede haber sido un fallo temporal al consultar tu información.
      </p>

      {#if error}
        <div class="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      {/if}

      <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <a
          href="/"
          class="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Volver al inicio
        </a>
        <button
          type="button"
          on:click={retryLoad}
          class="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          Reintentar carga
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="min-h-screen bg-gray-50 px-4 py-6 dark:bg-gray-900">
    <div class="mx-auto max-w-3xl space-y-6">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <a
            href="/"
            class="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            <span aria-hidden="true">←</span>
            Volver al feed
          </a>
          <div class="mt-3 flex flex-wrap items-center gap-3 text-sm font-medium">
            <a
              href="/discover"
              class="text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Descubrir
            </a>
            <a
              href="/matches"
              class="text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Matches
            </a>
            <a
              href="/messages"
              class="text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Mensajes
            </a>
          </div>
          <h1 class="mt-3 text-3xl font-bold text-gray-900 dark:text-white">Editar perfil</h1>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Actualiza cómo te presentas en Atrevidos. Tus cambios se aplican solo a tu perfil.
          </p>
        </div>

        <button
          type="button"
          on:click={handleSubmit}
          disabled={formBusy}
          class="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if saving}
            Guardando…
          {:else if avatarUploading || galleryUploading}
            Subiendo imágenes…
          {:else}
            Guardar cambios
          {/if}
        </button>
      </header>

      {#if error}
        <div class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      {/if}

      {#if success}
        <div class="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">
          {success}
        </div>
      {/if}

      {#if mediaLoadError}
        <div class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {mediaLoadError}
        </div>
      {/if}

      <section class="rounded-2xl bg-white p-5 shadow-lg dark:bg-gray-800 sm:p-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-4">
            {#if avatarPreviewUrl}
              <img
                src={avatarPreviewUrl}
                alt={form.displayName.trim() || form.username || 'Avatar de perfil'}
                class="h-16 w-16 rounded-full object-cover shadow-md"
              />
            {:else}
              <div class="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                {profileInitial}
              </div>
            {/if}
            <div>
              <p class="text-lg font-semibold text-gray-900 dark:text-white">
                {form.displayName.trim() || 'Tu nombre visible'}
              </p>
              <p class="text-sm text-gray-500 dark:text-gray-400">@{form.username || 'usuario'}</p>
            </div>
          </div>

          <div class="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-400">
            <p>Onboarding completado</p>
            <p class="mt-1 font-medium text-gray-800 dark:text-gray-200">
              {profile?.onboarding_completed_at ? new Date(profile.onboarding_completed_at).toLocaleDateString() : 'Sí'}
            </p>
          </div>
        </div>
      </section>

      <section class="rounded-2xl bg-white p-5 shadow-lg dark:bg-gray-800 sm:p-6">
        <div class="flex flex-col gap-6 lg:flex-row">
          <div class="lg:w-72 lg:flex-none">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Avatar</h2>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Sube una imagen JPG, PNG o WEBP de hasta 5 MB para destacar en el feed y discovery.
            </p>

            <div class="mt-5 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center dark:border-gray-700 dark:bg-gray-900">
              {#if avatarPreviewUrl}
                <img src={avatarPreviewUrl} alt="Preview del avatar" class="h-28 w-28 rounded-full object-cover shadow-md" />
              {:else}
                <div class="flex h-28 w-28 items-center justify-center rounded-full bg-indigo-100 text-4xl font-bold text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                  {profileInitial}
                </div>
              {/if}

              <input
                bind:this={avatarInput}
                type="file"
                accept={PROFILE_IMAGE_ACCEPT}
                class="hidden"
                disabled={formBusy}
                on:change={handleAvatarChange}
              />

              <button
                type="button"
                on:click={() => avatarInput?.click()}
                disabled={formBusy}
                class="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {#if avatarUploading}Subiendo avatar…{:else if profile?.avatar_url}Cambiar avatar{:else}Subir avatar{/if}
              </button>

              {#if avatarError}
                <p class="text-sm text-red-600 dark:text-red-300">{avatarError}</p>
              {/if}

              {#if avatarSuccess}
                <p class="text-sm text-green-600 dark:text-green-300">{avatarSuccess}</p>
              {/if}
            </div>
          </div>

          <div class="flex-1">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Galería privada del perfil</h2>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Añade hasta {MAX_PROFILE_GALLERY_IMAGES} fotos para completar tu identidad visual. Discovery seguirá usando el avatar como imagen principal.
                </p>
              </div>

              <div class="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-400">
                {currentGalleryRefs.length}/{MAX_PROFILE_GALLERY_IMAGES} fotos · {remainingGallerySlots} espacios libres
              </div>
            </div>

            <div class="mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white">Subida múltiple</p>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Acepta JPG, PNG o WEBP de hasta 8 MB por imagen.
                  </p>
                </div>

                <input
                  bind:this={galleryInput}
                  type="file"
                  accept={PROFILE_IMAGE_ACCEPT}
                  multiple
                  class="hidden"
                  disabled={formBusy || remainingGallerySlots === 0}
                  on:change={handleGalleryChange}
                />

                <button
                  type="button"
                  on:click={() => galleryInput?.click()}
                  disabled={formBusy || remainingGallerySlots === 0}
                  class="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {#if galleryUploading}
                    Subiendo galería…
                  {:else if remainingGallerySlots === 0}
                    Galería completa
                  {:else}
                    Añadir fotos
                  {/if}
                </button>
              </div>

              {#if galleryError}
                <p class="mt-3 text-sm text-red-600 dark:text-red-300">{galleryError}</p>
              {/if}

              {#if gallerySuccess}
                <p class="mt-3 text-sm text-green-600 dark:text-green-300">{gallerySuccess}</p>
              {/if}
            </div>

            <div class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {#if galleryPreviewUrls.length > 0}
                {#each galleryPreviewUrls as galleryPreviewUrl, index}
                  <article class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <img src={galleryPreviewUrl} alt={`Imagen ${index + 1} de la galería`} class="h-44 w-full object-cover" />
                    <div class="flex items-center justify-between gap-3 p-3">
                      <p class="text-xs text-gray-500 dark:text-gray-400">Foto {index + 1}</p>
                      <button
                        type="button"
                        on:click={() => removeGalleryImage(index)}
                        disabled={formBusy}
                        class="inline-flex items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                      >
                        {#if removingGalleryIndex === index}Eliminando…{:else}Eliminar{/if}
                      </button>
                    </div>
                  </article>
                {/each}
              {:else}
                <div class="sm:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center dark:border-gray-700 dark:bg-gray-900">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">Todavía no has subido fotos a tu galería.</p>
                  <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Empieza con una o dos imágenes reales para mejorar confianza y contexto en tu perfil.
                  </p>
                </div>
              {/if}
            </div>

            <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
              Nota MVP: esta galería depende de buckets privados <code>avatars</code> y <code>covers</code> con políticas de Storage activas en Supabase.
            </p>
          </div>
        </div>
      </section>

      <section class="rounded-2xl bg-white p-5 shadow-lg dark:bg-gray-800 sm:p-6">
        <form class="space-y-5" on:submit|preventDefault={handleSubmit}>
          <div class="grid gap-5 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label for="username" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
                Nombre de usuario
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                minlength="3"
                maxlength="30"
                autocomplete="username"
                bind:value={form.username}
                on:input={() => {
                  form.username = normalizeUsername(form.username);
                }}
                disabled={formBusy}
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                placeholder="tu_nombre"
              />
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">Solo letras minúsculas, números y guion bajo.</p>
            </div>

            <div class="sm:col-span-2">
              <label for="displayName" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
                Nombre visible
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                required
                maxlength="80"
                autocomplete="name"
                bind:value={form.displayName}
                disabled={formBusy}
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                placeholder="Cómo quieres que te vean"
              />
            </div>

            <div class="sm:col-span-2">
              <label for="bio" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
                Biografía
              </label>
              <textarea
                id="bio"
                name="bio"
                required
                rows="4"
                maxlength="280"
                bind:value={form.bio}
                disabled={formBusy}
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                placeholder="Cuéntanos algo sobre ti, tu vibra o lo que te gusta conversar"
              ></textarea>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">{form.bio.trim().length}/280 caracteres</p>
            </div>

            <div>
              <label for="location" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
                Ubicación
              </label>
              <input
                id="location"
                name="location"
                type="text"
                required
                maxlength="120"
                autocomplete="address-level2"
                bind:value={form.location}
                disabled={formBusy}
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                placeholder="Ciudad, país"
              />
            </div>

            <div>
              <label for="interests" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
                Intereses
              </label>
              <input
                id="interests"
                name="interests"
                type="text"
                required
                bind:value={form.interests}
                disabled={formBusy}
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                placeholder="música, viajes, café, senderismo"
              />
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">Sepáralos con comas.</p>
            </div>

            <div class="sm:col-span-2">
              <label for="relationshipIntent" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
                ¿Qué buscas en Atrevidos?
              </label>
              <select
                id="relationshipIntent"
                name="relationshipIntent"
                required
                bind:value={form.relationshipIntent}
                disabled={formBusy}
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              >
                <option value="">Selecciona una opción</option>
                {#each RELATIONSHIP_INTENT_OPTIONS as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
              <div class="mt-3 space-y-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-400">
                {#each RELATIONSHIP_INTENT_OPTIONS as option}
                  <p>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">{option.label}:</span>
                    {option.description}
                  </p>
                {/each}
              </div>
            </div>

            <div class="sm:col-span-2">
              <label for="relationshipPreferences" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
                Preferencias de conexión <span class="text-gray-400">(opcional)</span>
              </label>
              <textarea
                id="relationshipPreferences"
                name="relationshipPreferences"
                rows="3"
                maxlength="200"
                bind:value={form.relationshipPreferences}
                disabled={formBusy}
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                placeholder="Por ejemplo: me gustan las conversaciones tranquilas, planes al aire libre o gente creativa"
              ></textarea>
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">{form.relationshipPreferences.trim().length}/200 caracteres</p>
            </div>
          </div>

          <div class="space-y-3 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900">
            <div class="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <span class="mt-0.5 text-green-600 dark:text-green-400">✓</span>
              <span>Edad confirmada: mayor de 18 años.</span>
            </div>
            <div class="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <span class="mt-0.5 text-green-600 dark:text-green-400">✓</span>
              <span>Consentimiento y uso respetuoso confirmados.</span>
            </div>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <a
              href="/"
              class="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </a>
            <button
              type="submit"
              disabled={formBusy}
              class="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {#if saving}
                Guardando…
              {:else}
                Guardar cambios
              {/if}
            </button>
          </div>
        </form>
      </section>
    </div>
  </div>
{/if}
