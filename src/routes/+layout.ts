import { browser } from '$app/environment';
import { auth } from '$lib';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import { page } from '$app/stores';
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

        // Redirect anonymous users from protected routes
        const currentPath = get(page).url.pathname;
        const publicRoutes = ['/', '/login', '/signup', '/terms', '/privacy', '/safety'];
        const isPublicRoute = publicRoutes.includes(currentPath);
        
    if (!session && !isPublicRoute) {
        // Use replace state to avoid infinite back button loop.
        await goto('/login', { replaceState: true }); 
    }
	}

	return {
		session
	};
};