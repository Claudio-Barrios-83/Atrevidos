<script lang="ts">
  // Hoja de estilos global de Tailwind. Sin este import, PostCSS/Tailwind
  // nunca procesa nada y el build no genera NINGÚN CSS: toda la app se ve
  // sin estilos en producción (clases utilitarias presentes en el markup
  // pero sin reglas CSS que las respalden).
  import '../app.css';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { decideAuthRedirect, type OnboardingStatus } from '$lib/auth-routing';
  import { shouldRefreshOnboardingState } from '$lib/onboarding-routing';
  import { loadOnboardingState, onboardingStateRevision } from '$lib/onboarding';
  import { auth } from '$lib';

  let redirecting = false;
  let onboardingLoading = false;
  let onboardingCheckedKey: string | null = null;
  let onboardingErroredKey: string | null = null;
  let onboardingErrorPathname: string | null = null;
  let onboardingStatus: OnboardingStatus = 'unknown';

  $: authState = $auth;
  $: pathname = $page.url.pathname;
  $: onboardingRevision = $onboardingStateRevision;
  $: currentOnboardingKey = authState.user ? `${authState.user.id}:${onboardingRevision}` : null;
  $: onboardingReadyForRouting = !authState.user || onboardingCheckedKey === currentOnboardingKey || onboardingStatus === 'error';
  $: shouldShowShellLoader =
    browser &&
    (!authState.initialized || redirecting || (!!authState.user && onboardingLoading && !onboardingReadyForRouting));

  $: if (browser && authState.initialized) {
    const user = authState.user;
    const currentKey = currentOnboardingKey;

    if (!user) {
      onboardingLoading = false;
      onboardingCheckedKey = null;
      onboardingErroredKey = null;
      onboardingErrorPathname = null;
      onboardingStatus = 'unknown';
    } else if (
      shouldRefreshOnboardingState({
        currentOnboardingKey: currentKey,
        onboardingCheckedKey,
        onboardingErroredKey,
        onboardingErrorPathname,
        onboardingLoading,
        onboardingStatus,
        pathname
      }) &&
      currentKey
    ) {
      void refreshOnboardingState(currentKey, user.id);
    }
  }

  $: if (browser && authState.initialized && onboardingReadyForRouting) {
    const redirectTarget = decideAuthRedirect({
      pathname,
      isAuthenticated: !!authState.user,
      onboardingStatus
    });

    if (redirectTarget && !redirecting) {
      redirecting = true;
      void goto(redirectTarget, { replaceState: true }).finally(() => {
        redirecting = false;
      });
    }
  }

  async function refreshOnboardingState(onboardingKey: string, userId: string) {
    onboardingLoading = true;

    try {
      const user = authState.user;

      if (!user || user.id !== userId) {
        return;
      }

      const state = await loadOnboardingState(user);

      if (authState.user?.id !== userId || currentOnboardingKey !== onboardingKey) {
        return;
      }

      onboardingStatus = state.isComplete ? 'complete' : 'incomplete';
      onboardingCheckedKey = onboardingKey;
      onboardingErroredKey = null;
      onboardingErrorPathname = null;
    } catch (error) {
      console.error('No se pudo comprobar el onboarding:', error);

      if (authState.user?.id !== userId || currentOnboardingKey !== onboardingKey) {
        return;
      }

      onboardingStatus = 'error';
      onboardingErroredKey = onboardingKey;
      onboardingErrorPathname = pathname;
    } finally {
      if (authState.user?.id === userId && currentOnboardingKey === onboardingKey) {
        onboardingLoading = false;
      }
    }
  }
</script>

{#if shouldShowShellLoader}
  <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-center text-gray-600 dark:bg-gray-900 dark:text-gray-300">
    <div>
      <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
      <p class="mt-4 text-sm font-medium">Preparando tu sesión…</p>
    </div>
  </div>
{:else}
  {#if $auth.user}
    <button
    onclick={async () => {
      try {
        await auth.signOut();
      } catch (err) {
        console.error('Logout failed:', err);
        alert('No se pudo cerrar sesión');
      }
    }}
    class="fixed right-4 top-4 rounded bg-red-500 p-2 text-white transition hover:bg-red-600"
  >
    Cerrar sesión
  </button>
  {/if}
  <slot />
{/if}
