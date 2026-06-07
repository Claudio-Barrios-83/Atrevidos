import { browser } from '$app/environment';
import { auth } from '$lib/stores/auth';
import { get } from 'svelte/store';
import type { LayoutLoad } from './$types';

export const ssr = false;

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