<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { supabase } from '$lib/supabase/client';
  import { auth } from '$lib';
  import {
    uploadAvatarImage,
    uploadGalleryImage,
    updateProfileMedia,
    deleteStorageObject,
    resolveStorageImageUrl
  } from '$lib/supabase/profile-media';
  import {
    validateProfileImageFile,
    MAX_AVATAR_IMAGE_BYTES,
    MAX_GALLERY_IMAGE_BYTES,
    MAX_PROFILE_GALLERY_IMAGES,
    getRemainingGallerySlots,
    PROFILE_IMAGE_MIME_TYPES
  } from '$lib/profile/media';
  import {
    saveProfile,
    buildProfileFormValues,
    formatInterests,
    normalizeUsername,
    RELATIONSHIP_INTENT_OPTIONS,
    type ProfileFormValues,
    type ProfileRow
  } from '$lib/onboarding';
  import LoadingState from '$lib/components/loading-state.svelte';
  import ErrorState from '$lib/components/error-state.svelte';

  const PROFILE_IMAGE_ACCEPT = PROFILE_IMAGE_MIME_TYPES.join(',');

  let profile: ProfileRow | null = null;
  let loading = true;
  let loadError = '';
  let editing = false;
  let saving = false;
  let saveError = '';
  let saveSuccess = '';

  // Avatar
  let avatarFile: File | null = null;
  let avatarPreviewUrl: string | null = null;

  // Gallery
  let galleryFiles: Array<{ id: string; file: File; previewUrl: string }> = [];
  let galleryInput: HTMLInputElement | null = null;

  // Form
  let form: ProfileFormValues = {
    username: '',
    displayName: '',
    bio: '',
    location: '',
    interests: '',
    relationshipIntent: '',
    relationshipPreferences: '',
    consentAcknowledged: false,
    ageConfirmed: false
  };

  let galleryImageIdCounter = 0;

  function generateGalleryImageId() {
    return `gallery-${++galleryImageIdCounter}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  }

  function getRemainingSlots() {
    return getRemainingGallerySlots(galleryFiles.length + (profile?.gallery_urls?.length ?? 0));
  }

  function revokeGalleryPreviews() {
    for (const item of galleryFiles) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }

  function clearGalleryFiles() {
    revokeGalleryPreviews();
    galleryFiles = [];
  }

  async function loadProfile() {
    if (!$auth.user) return;
    loading = true;
    loadError = '';
    saveError = '';
    saveSuccess = '';

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select(
          'id, username, display_name, bio, avatar_url, gallery_urls, location, interests, relationship_intent, relationship_preferences, consent_acknowledged, age_confirmed, onboarding_completed_at'
        )
        .eq('id', $auth.user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      profile = data as ProfileRow | null;

      if (profile) {
        form = buildProfileFormValues(profile);
      }
    } catch (e) {
      loadError = 'No pudimos cargar tu perfil. Inténtalo de nuevo.';
      console.error('Error loading profile:', e);
    } finally {
      loading = false;
    }
  }

  function startEditing() {
    if (!profile) return;
    form = buildProfileFormValues(profile);
    avatarFile = null;
    avatarPreviewUrl = null;
    clearGalleryFiles();
    saveError = '';
    saveSuccess = '';
    editing = true;
  }

  function cancelEditing() {
    editing = false;
    avatarFile = null;
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
      avatarPreviewUrl = null;
    }
    clearGalleryFiles();
    saveError = '';
    saveSuccess = '';
  }

  function handleAvatarChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const validation = validateProfileImageFile(file, 'avatar');
    if (!validation.valid) {
      saveError = validation.error;
      input.value = '';
      return;
    }

    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    avatarFile = file;
    avatarPreviewUrl = URL.createObjectURL(file);
    saveError = '';
    input.value = '';
  }

  function removeNewAvatar() {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    avatarFile = null;
    avatarPreviewUrl = null;
  }

  function handleGalleryChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    const remaining = getRemainingSlots();
    if (files.length > remaining) {
      saveError = `Puedes añadir hasta ${remaining} foto${remaining === 1 ? '' : 's'} más a la galería.`;
      input.value = '';
      return;
    }

    for (const file of files) {
      const validation = validateProfileImageFile(file, 'gallery');
      if (!validation.valid) {
        saveError = validation.error;
        input.value = '';
        return;
      }
    }

    galleryFiles = [
      ...galleryFiles,
      ...files.map((file) => ({
        id: generateGalleryImageId(),
        file,
        previewUrl: URL.createObjectURL(file)
      }))
    ];
    saveError = '';
    input.value = '';
  }

  function removeNewGalleryImage(id: string) {
    const item = galleryFiles.find((g) => g.id === id);
    if (item) {
      URL.revokeObjectURL(item.previewUrl);
      galleryFiles = galleryFiles.filter((g) => g.id !== id);
    }
  }

  async function removeExistingGalleryImage(index: number) {
    if (!profile?.gallery_urls || saving) return;
    saving = true;
    saveError = '';
    saveSuccess = '';

    try {
      const imageRef = profile.gallery_urls[index];
      await deleteStorageObject(imageRef);

      const updatedUrls = profile.gallery_urls.filter((_, i) => i !== index);
      const updated = await updateProfileMedia($auth.user!.id, { gallery_urls: updatedUrls });
      profile = { ...profile, gallery_urls: updated?.gallery_urls ?? updatedUrls };

      saveSuccess = 'Imagen de galería eliminada.';
    } catch (e) {
      console.error('Error removing gallery image:', e);
      saveError = 'No pudimos eliminar esa imagen. Inténtalo de nuevo.';
    } finally {
      saving = false;
    }
  }

  async function handleSave() {
    if (saving || !profile || !$auth.user) return;
    saving = true;
    saveError = '';
    saveSuccess = '';

    try {
      // 1. Upload avatar if changed
      if (avatarFile) {
        const oldAvatarRef = profile.avatar_url;
        const newAvatarRef = await uploadAvatarImage($auth.user.id, avatarFile);
        // Clean up old avatar
        if (oldAvatarRef) {
          await deleteStorageObject(oldAvatarRef).catch(() => {});
        }
        const updated = await updateProfileMedia($auth.user.id, { avatar_url: newAvatarRef });
        profile = { ...profile, avatar_url: updated?.avatar_url ?? newAvatarRef };
        avatarFile = null;
        if (avatarPreviewUrl) {
          URL.revokeObjectURL(avatarPreviewUrl);
          avatarPreviewUrl = null;
        }
      }

      // 2. Upload gallery images if any
      if (galleryFiles.length > 0) {
        const newRefs: string[] = [];
        for (const item of galleryFiles) {
          const ref = await uploadGalleryImage($auth.user.id, item.file, item.id);
          newRefs.push(ref);
        }
        const existingUrls = profile.gallery_urls ?? [];
        const mergedUrls = [...existingUrls, ...newRefs];
        const updated = await updateProfileMedia($auth.user.id, { gallery_urls: mergedUrls });
        profile = { ...profile, gallery_urls: updated?.gallery_urls ?? mergedUrls };
        clearGalleryFiles();
      }

      // 3. Save profile fields
      const updatedProfile = await saveProfile($auth.user, form, {
        preserveOnboardingCompletion: true,
        requireAcknowledgements: false,
        currentProfile: profile
      });

      if (updatedProfile) {
        profile = updatedProfile;
        form = buildProfileFormValues(updatedProfile);
      }

      saveSuccess = 'Perfil actualizado correctamente.';
      editing = false;
    } catch (e: any) {
      console.error('Error saving profile:', e);
      const message = e instanceof Error ? e.message.toLowerCase() : '';
      if (message.includes('duplicate key') || message.includes('profiles_username_key')) {
        saveError = 'Ese nombre de usuario ya está en uso. Elige otro.';
      } else {
        saveError = e instanceof Error ? e.message : 'No pudimos guardar los cambios. Inténtalo de nuevo.';
      }
    } finally {
      saving = false;
    }
  }

  function formatInterestsDisplay(interests: string[] | null | undefined) {
    return formatInterests(interests);
  }

  function resolveAvatarSrc(url: string | null | undefined) {
    return url ? resolveStorageImageUrl(url) : Promise.resolve(null);
  }

  let resolvedAvatarUrl: string | null | undefined = undefined;
  let resolvedGalleryUrls: string[] = [];

  $: if (profile && !editing) {
    const avatarPromise = resolveAvatarSrc(profile.avatar_url);
    avatarPromise.then((url) => { resolvedAvatarUrl = url; });

    if (profile.gallery_urls && profile.gallery_urls.length > 0) {
      Promise.all(profile.gallery_urls.map((u) => resolveStorageImageUrl(u))).then((urls) => {
        resolvedGalleryUrls = urls.filter((u): u is string => Boolean(u));
      });
    } else {
      resolvedGalleryUrls = [];
    }
  }

  let mounted = false;
  let loadAttempted = false;

  onMount(() => {
    mounted = true;
  });

  // Se activa al montar o cuando auth se inicializa (si llega después del mount)
  $: if (mounted && $auth.initialized && $auth.user && !loadAttempted) {
    loadAttempted = true;
    loadProfile();
  }

  onDestroy(() => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    revokeGalleryPreviews();
  });
</script>

<div class="min-h-screen bg-gray-50 px-4 py-6 dark:bg-gray-900">
  <div class="mx-auto max-w-2xl space-y-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div class="flex flex-wrap items-center gap-3 text-sm font-medium">
          <a href="/" class="text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">Feed</a>
          <a href="/discover" class="text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">Descubrir</a>
          <a href="/matches" class="text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">Matches</a>
          <a href="/messages" class="text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">Mensajes</a>
        </div>
        <h1 class="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
          {editing ? 'Editar perfil' : 'Mi perfil'}
        </h1>
      </div>

      {#if profile && !editing}
        <button
          type="button"
          on:click={startEditing}
          class="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          Editar perfil
        </button>
      {/if}
    </header>

    {#if saveSuccess}
      <div class="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
        {saveSuccess}
      </div>
    {/if}

    {#if saveError}
      <div class="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
        {saveError}
      </div>
    {/if}

    {#if loading}
      <LoadingState message="Cargando perfil..." />
    {:else if loadError}
      <ErrorState message={loadError} retry={loadProfile} />
    {:else if profile}
      <!-- ═══════ AVATAR ═══════ -->
      {@const p = profile}
      <section class="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Foto de perfil</h2>

        {#if editing}
          <div class="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div class="relative h-28 w-28 shrink-0">
              {#if avatarPreviewUrl}
                <img src={avatarPreviewUrl} alt="Nuevo avatar" class="h-28 w-28 rounded-2xl object-cover shadow-md" />
                <button
                  type="button"
                  on:click={removeNewAvatar}
                  disabled={saving}
                  class="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-xs text-white shadow transition hover:bg-red-600 disabled:opacity-50"
                  aria-label="Quitar nueva foto"
                >
                  ✕
                </button>
              {:else if resolvedAvatarUrl}
                <img src={resolvedAvatarUrl} alt="Avatar actual" class="h-28 w-28 rounded-2xl object-cover shadow-md" />
              {:else}
                <div class="flex h-28 w-28 items-center justify-center rounded-2xl bg-indigo-100 text-3xl font-bold text-indigo-600 shadow-md dark:bg-indigo-900 dark:text-indigo-300">
                  {(profile.display_name || profile.username || 'U').trim()[0].toUpperCase()}
                </div>
              {/if}
            </div>

            <div class="flex flex-col gap-3">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                JPG, PNG o WEBP · máx. {MAX_AVATAR_IMAGE_BYTES / (1024 * 1024)} MB
              </p>
              <label class="inline-flex cursor-pointer items-center justify-center rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800">
                <span>{avatarFile ? 'Cambiar foto' : 'Subir foto'}</span>
                <input type="file" accept={PROFILE_IMAGE_ACCEPT} class="hidden" disabled={saving} on:change={handleAvatarChange} />
              </label>
            </div>
          </div>
        {:else}
          <div class="mt-4 flex items-center gap-4">
            {#if resolvedAvatarUrl}
              <img src={resolvedAvatarUrl} alt="Avatar" class="h-28 w-28 rounded-2xl object-cover shadow-md" />
            {:else}
              <div class="flex h-28 w-28 items-center justify-center rounded-2xl bg-indigo-100 text-3xl font-bold text-indigo-600 shadow-md dark:bg-indigo-900 dark:text-indigo-300">
                {(profile.display_name || profile.username || 'U').trim()[0].toUpperCase()}
              </div>
            {/if}
          </div>
        {/if}
      </section>

      <!-- ═══════ GALERÍA ═══════ -->
      <section class="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Galería</h2>
          {#if editing}
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {((profile.gallery_urls ?? []).length + galleryFiles.length)}/{MAX_PROFILE_GALLERY_IMAGES}
            </p>
          {/if}
        </div>

        {#if editing}
          <div class="mt-4">
            <input
              bind:this={galleryInput}
              type="file"
              accept={PROFILE_IMAGE_ACCEPT}
              multiple
              class="hidden"
              disabled={saving || getRemainingSlots() === 0}
              on:change={handleGalleryChange}
            />
            <button
              type="button"
              on:click={() => galleryInput?.click()}
              disabled={saving || getRemainingSlots() === 0}
              class="inline-flex items-center justify-center rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              {#if getRemainingSlots() === 0}
                Límite alcanzado
              {:else}
                + Añadir foto{getRemainingSlots() > 1 ? 's' : ''}
              {/if}
            </button>
            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
              JPG, PNG o WEBP · máx. {MAX_GALLERY_IMAGE_BYTES / (1024 * 1024)} MB c/u
            </p>
          </div>
        {/if}

        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {#each (profile.gallery_urls ?? []) as url, index}
            <div class="group relative overflow-hidden rounded-xl bg-gray-100 shadow-sm dark:bg-gray-900">
              <img
                src={resolvedGalleryUrls[index] || url}
                alt={`Foto de galería ${index + 1}`}
                class="h-36 w-full object-cover"
                loading="lazy"
              />
              {#if editing}
                <button
                  type="button"
                  on:click={() => removeExistingGalleryImage(index)}
                  disabled={saving}
                  class="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-xs text-white opacity-0 shadow transition hover:bg-red-600 group-hover:opacity-100 disabled:opacity-50"
                  aria-label="Eliminar foto de galería"
                >
                  ✕
                </button>
              {/if}
            </div>
          {/each}
          {#each galleryFiles as item (item.id)}
            <div class="group relative overflow-hidden rounded-xl bg-gray-100 shadow-sm dark:bg-gray-900">
              <img src={item.previewUrl} alt="Nueva foto" class="h-36 w-full object-cover" />
              <button
                type="button"
                on:click={() => removeNewGalleryImage(item.id)}
                disabled={saving}
                class="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-xs text-white opacity-0 shadow transition hover:bg-red-600 group-hover:opacity-100 disabled:opacity-50"
                aria-label="Quitar foto nueva"
              >
                ✕
              </button>
              <span class="absolute bottom-2 left-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                Nueva
              </span>
            </div>
          {/each}
          {#if (profile.gallery_urls ?? []).length === 0 && galleryFiles.length === 0}
            <div class="col-span-full rounded-xl border border-dashed border-gray-300 px-5 py-8 text-center dark:border-gray-600">
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {editing ? 'Aún no has añadido fotos a tu galería.' : 'Sin fotos en la galería.'}
              </p>
            </div>
          {/if}
        </div>
      </section>

      <!-- ═══════ INFORMACIÓN ═══════ -->
      {#if editing}
        <section class="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Información del perfil</h2>
          <form class="mt-4 space-y-5" on:submit|preventDefault={handleSave}>
            <div class="grid gap-5 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <label for="edit-username" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Nombre de usuario</label>
                <input
                  id="edit-username" type="text" required minlength="3" maxlength="30"
                  bind:value={form.username}
                  on:input={() => { form.username = normalizeUsername(form.username); }}
                  disabled={saving}
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  placeholder="tu_nombre"
                />
              </div>

              <div class="sm:col-span-2">
                <label for="edit-displayName" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Nombre visible</label>
                <input
                  id="edit-displayName" type="text" required maxlength="80"
                  bind:value={form.displayName}
                  disabled={saving}
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  placeholder="Cómo quieres que te vean"
                />
              </div>

              <div class="sm:col-span-2">
                <label for="edit-bio" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Biografía</label>
                <textarea
                  id="edit-bio" required rows="4" maxlength="280"
                  bind:value={form.bio}
                  disabled={saving}
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  placeholder="Cuéntanos algo sobre ti"
                ></textarea>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{form.bio.trim().length}/280 caracteres</p>
              </div>

              <div>
                <label for="edit-location" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Ubicación</label>
                <input
                  id="edit-location" type="text" required maxlength="120"
                  bind:value={form.location}
                  disabled={saving}
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  placeholder="Ciudad, país"
                />
              </div>

              <div>
                <label for="edit-interests" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Intereses</label>
                <input
                  id="edit-interests" type="text" required
                  bind:value={form.interests}
                  disabled={saving}
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  placeholder="música, viajes, café"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Sepáralos con comas.</p>
              </div>

              <div class="sm:col-span-2">
                <label for="edit-relationshipIntent" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">¿Qué buscas en Atrevidos?</label>
                <select
                  id="edit-relationshipIntent" required
                  bind:value={form.relationshipIntent}
                  disabled={saving}
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                >
                  <option value="">Selecciona una opción</option>
                  {#each RELATIONSHIP_INTENT_OPTIONS as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </div>

              <div class="sm:col-span-2">
                <label for="edit-relationshipPreferences" class="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
                  Preferencias de conexión <span class="text-gray-400">(opcional)</span>
                </label>
                <textarea
                  id="edit-relationshipPreferences" rows="3" maxlength="200"
                  bind:value={form.relationshipPreferences}
                  disabled={saving}
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  placeholder="Por ejemplo: me gustan las conversaciones tranquilas"
                ></textarea>
              </div>
            </div>

            <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                on:click={cancelEditing}
                disabled={saving}
                class="inline-flex items-center justify-center rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                class="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {#if saving}
                  <svg class="mr-2 h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Guardando…
                {:else}
                  Guardar cambios
                {/if}
              </button>
            </div>
          </form>
        </section>
      {:else}
        <!-- ═══════ VIEW MODE ═══════ -->
        <section class="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            {profile.display_name || profile.username || 'Usuario'}
          </h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">@{profile.username}</p>

          <div class="mt-5 space-y-4">
            {#if profile.bio}
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Biografía</h3>
                <p class="mt-1 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{profile.bio}</p>
              </div>
            {/if}

            <div class="grid gap-4 sm:grid-cols-2">
              {#if profile.location}
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Ubicación</h3>
                  <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">{profile.location}</p>
                </div>
              {/if}

              {#if profile.interests && profile.interests.length > 0}
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Intereses</h3>
                  <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">{formatInterestsDisplay(profile.interests)}</p>
                </div>
              {/if}
            </div>

            {#if profile.relationship_intent}
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Intención</h3>
                <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {RELATIONSHIP_INTENT_OPTIONS.find((o) => o.value === p.relationship_intent)?.label ?? p.relationship_intent}
                </p>
              </div>
            {/if}

            {#if profile.relationship_preferences}
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Preferencias</h3>
                <p class="mt-1 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{profile.relationship_preferences}</p>
              </div>
            {/if}
          </div>
        </section>
      {/if}
    {:else}
      <div class="rounded-2xl bg-white px-6 py-12 text-center shadow-lg dark:bg-gray-800">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Perfil no encontrado</h2>
        <p class="mt-3 text-sm text-gray-600 dark:text-gray-400">No pudimos encontrar tu perfil. Intenta completar el onboarding primero.</p>
        <a href="/onboarding" class="mt-6 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700">Ir al onboarding</a>
      </div>
    {/if}
  </div>
</div>
