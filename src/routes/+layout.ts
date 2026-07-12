import { browser } from '$app/environment';
import { auth } from '$lib';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import type { LayoutLoad } from './$types';
import { decideAuthRedirect } from '$lib/auth-routing';

export const ssr = false;

export const load: LayoutLoad = async () => {
	let session = null;
    let onboardingStatus = 'unknown'; // Note: Should probably fetch real status

	if (browser) {
		try {
			await auth.init();
		} catch (error) {
			console.error('No se pudo inicializar la sesión:', error);
		}

		session = get(auth).session;

        const currentPath = get(page).url.pathname;
        const redirect = decideAuthRedirect({
            pathname: currentPath,
            isAuthenticated: !!session,
            onboardingStatus: onboardingStatus as any
        });
        
        if (redirect) {
            await goto(redirect, { replaceState: true }); 
        }
	}

	return {
		session
	};
};