import { browser } from '$app/environment';
import { auth } from '$lib';
import { get } from 'svelte/store';
import type { LayoutLoad } from './$types';

export const ssr = false;

/**
 * Solo inicializa la sesión. Las redirecciones de auth/onboarding viven en
 * `+layout.svelte` (reactivo al store), NO acá.
 *
 * Antes este load hacía `await loadOnboardingState()` y luego `goto(...)`.
 * Eso era una race peligrosa al cerrar sesión: el await podía completar con
 * una sesión ya invalidada en el store, y el `goto('/onboarding')` stale
 * pelearaba con el redirect reactivo a /welcome|/login, dejando la app
 * colgada en /onboarding con el spinner "Preparando tu sesión…".
 */
export const load: LayoutLoad = async () => {
	let session = null;

	if (browser) {
		try {
			await auth.init();
		} catch (error) {
			console.error('No se pudo inicializar la sesión:', error);
		}

		session = get(auth).session;
	}

	return {
		session
	};
};
