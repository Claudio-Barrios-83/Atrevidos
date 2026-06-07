<script lang="ts">
  import { goto } from '$app/navigation';
  import { LEGAL_NOTICE_LINKS } from '$lib/legal';
  import { auth } from '$lib/stores/auth';
  import {
    buildOnboardingFormValues,
    EMPTY_ONBOARDING_FORM,
    loadOnboardingState,
    normalizeUsername,
    RELATIONSHIP_INTENT_OPTIONS,
    saveOnboarding,
    type OnboardingFormValues
  } from '$lib/onboarding';

  let form: OnboardingFormValues = { ...EMPTY_ONBOARDING_FORM };
  let loading = true;
  let saving = false;
  let initializedForUserId: string | null = null;
  let loadFailed = false;
  let error = '';
  let success = '';

  $: authState = $auth;

  $: if (authState.initialized && !authState.user) {
    form = { ...EMPTY_ONBOARDING_FORM };
    loading = false;
    initializedForUserId = null;
    loadFailed = false;
  }

  $: if (authState.initialized && authState.user && initializedForUserId !== authState.user.id && !saving && !loading) {
    void hydrateForm(authState.user.id);
  }

  $: if (authState.initialized && authState.user && initializedForUserId === null && !saving && loading) {
    void hydrateForm(authState.user.id);
  }

  async function hydrateForm(expectedUserId?: string) {
    const user = authState.user;

    if (!user) {
      form = { ...EMPTY_ONBOARDING_FORM };
      loading = false;
      initializedForUserId = null;
      loadFailed = false;
      return;
    }

    if (expectedUserId && user.id !== expectedUserId) {
      return;
    }

    loading = true;
    loadFailed = false;
    error = '';
    success = '';

    try {
      const state = await loadOnboardingState(user);

      if (authState.user?.id !== user.id) {
        return;
      }

      if (state.isComplete) {
        await goto('/', { replaceState: true });
        return;
      }

      form = buildOnboardingFormValues(state);
      initializedForUserId = user.id;
    } catch (err) {
      console.error('Error cargando onboarding:', err);
      loadFailed = true;
      initializedForUserId = null;
      error = 'No pudimos cargar tu perfil inicial. Reinténtalo para continuar.';
    } finally {
      if (authState.user?.id === user.id) {
        loading = false;
      }
    }
  }

  async function retryLoad() {
    if (loading || saving || !authState.user) return;
    await hydrateForm(authState.user.id);
  }

  async function handleSubmit() {
    if (saving || loading || loadFailed) return;

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
      await saveOnboarding(user, form);
      success = 'Perfil completado. Ya puedes entrar a Atrevidos.';
      initializedForUserId = user.id;
      await goto('/', { replaceState: true });
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : '';

      if (message.includes('duplicate key') || message.includes('profiles_username_key')) {
        error = 'Ese nombre de usuario ya está en uso. Elige otro.';
      } else {
        error = err instanceof Error ? err.message : 'No pudimos guardar tu onboarding. Inténtalo de nuevo.';
      }
    } finally {
      saving = false;
    }
  }
</script>

{#if !authState.initialized || loading}
  <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
    <div class="text-center">
      <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Preparando tu onboarding…</p>
    </div>
  </div>
{:else if !authState.user}
  <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
    <div class="text-center">
      <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Redirigiendo al acceso…</p>
    </div>
  </div>
{:else if loadFailed}
  <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-6 dark:bg-gray-900">
    <div class="w-full max-w-lg rounded-2xl bg-white p-6 text-center shadow-lg dark:bg-gray-800">
      <p class="text-sm font-medium uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Onboarding</p>
      <h1 class="mt-3 text-2xl font-bold text-gray-900 dark:text-white">No pudimos cargar tu perfil inicial</h1>
      <p class="mt-3 text-sm text-gray-600 dark:text-gray-400">
        Puede haber sido un fallo temporal al consultar tu perfil. Reinténtalo para continuar.
      </p>

      {#if error}
        <div class="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      {/if}

      <button
        type="button"
        on:click={retryLoad}
        class="mt-6 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        Reintentar carga
      </button>
    </div>
  </div>
{:else}
  <div class="min-h-screen bg-gray-50 px-4 py-6 dark:bg-gray-900">
    <div class="mx-auto max-w-2xl">
      <div class="mb-6 text-center">
        <p class="text-sm font-medium uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Primer acceso</p>
        <h1 class="mt-3 text-3xl font-bold text-gray-900 dark:text-white">Completa tu perfil</h1>
        <p class="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Antes de usar Atrevidos necesitamos algunos datos básicos para preparar tu perfil.
        </p>
      </div>

      <div class="rounded-2xl bg-white p-5 shadow-lg dark:bg-gray-800 sm:p-6">
        {#if error}
          <div class="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        {/if}

        {#if success}
          <div class="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">
            {success}
          </div>
        {/if}

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
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
                class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                placeholder="Por ejemplo: me gustan las conversaciones tranquilas, planes al aire libre o gente creativa"
              ></textarea>
            </div>
          </div>

          <div class="space-y-3 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900">
            <label class="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                bind:checked={form.ageConfirmed}
                disabled={saving}
                class="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Confirmo que soy mayor de 18 años.</span>
            </label>

            <label class="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                bind:checked={form.consentAcknowledged}
                disabled={saving}
                class="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                Confirmo que usaré Atrevidos de forma respetuosa y con consentimiento claro en mis interacciones.
              </span>
            </label>

            <p class="text-xs text-gray-500 dark:text-gray-400">
              Antes de completar tu perfil, revisa
              {#each LEGAL_NOTICE_LINKS as link, index}
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${link.label} (se abre en una nueva pestaña)`}
                  class="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-indigo-400"
                >
                  {link.label.toLowerCase()}
                  <span class="sr-only"> (se abre en una nueva pestaña)</span>
                </a>{#if index < LEGAL_NOTICE_LINKS.length - 2},{:else if index === LEGAL_NOTICE_LINKS.length - 2} y {/if}
              {/each}.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            class="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {#if saving}
              <svg class="mr-2 h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Guardando…
            {:else}
              Completar perfil
            {/if}
          </button>
        </form>
      </div>
    </div>
  </div>
{/if}
