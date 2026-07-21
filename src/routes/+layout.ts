import { browser } from '$app/environment';
import { auth } from '$lib';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import type { LayoutLoad } from './$types';
import { decideAuthRedirect } from '$lib/auth-routing';

export const ssr = false;

export const load: LayoutLoad = async ({ url }) => {
	let session = null;
    let onboardingStatus = 'unknown'; // Note: Should probably fetch real status

	if (browser) {
		try {
			await auth.init();
		} catch (error) {
			console.error('No se pudo inicializar la sesión:', error);
		}

		session = get(auth).session;

        // Usamos el "url" que SvelteKit pasa directamente al load function en
        // vez de leerlo del store $page: en el primer render del cliente (con
        // ssr = false) ese store todavía puede no tener "url" poblado, lo que
        // provocaba "Cannot read properties of undefined (reading 'pathname')"
        // y rompía TODO el layout raíz (pantalla en blanco).
        const currentPath = url.pathname;
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