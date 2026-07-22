import { browser } from '$app/environment';
import { auth } from '$lib';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import type { LayoutLoad } from './$types';
import { decideAuthRedirect, type OnboardingStatus } from '$lib/auth-routing';
import { loadOnboardingState } from '$lib/onboarding';

export const ssr = false;

export const load: LayoutLoad = async ({ url }) => {
	let session = null;
	let onboardingStatus: OnboardingStatus = 'unknown';

	if (browser) {
		try {
			await auth.init();
		} catch (error) {
			console.error('No se pudo inicializar la sesión:', error);
		}

		session = get(auth).session;

		// Traemos el estado real de onboarding (en vez del "unknown" hardcodeado
		// que había antes) para que esta redirección "de arranque" tome la misma
		// decisión que +layout.svelte una vez que termina de comprobarlo de forma
		// reactiva. Con el valor hardcodeado, una persona autenticada con el
		// onboarding incompleto podía ver por una fracción de segundo una página
		// protegida (o la app podía "rebotar" entre esa página y /onboarding)
		// hasta que el chequeo reactivo del layout corregía la ruta.
		if (session?.user) {
			try {
				const state = await loadOnboardingState(session.user);
				onboardingStatus = state.isComplete ? 'complete' : 'incomplete';
			} catch (error) {
				console.error('No se pudo comprobar el estado de onboarding:', error);
				onboardingStatus = 'error';
			}
		}

		// Usamos el "url" que SvelteKit pasa directamente al load function en
		// vez de leerlo del store $page: en el primer render del cliente (con
		// ssr = false) ese store todavía puede no tener "url" poblado, lo que
		// provocaba "Cannot read properties of undefined (reading 'pathname')"
		// y rompía TODO el layout raíz (pantalla en blanco).
		const currentPath = url.pathname;
		const redirect = decideAuthRedirect({
			pathname: currentPath,
			isAuthenticated: !!session,
			onboardingStatus
		});

		if (redirect) {
			await goto(redirect, { replaceState: true });
		}
	}

	return {
		session
	};
};
