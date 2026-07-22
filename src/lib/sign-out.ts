import { goto } from '$app/navigation';
import { auth } from '$lib';

/**
 * Cierra la sesión y navega de inmediato a la landing pública.
 * El layout reactivo también redirige, pero hacerlo acá evita quedar
 * colgado en rutas protegidas (/onboarding, feed, etc.) si hay una
 * condición de carrera con loads/async en vuelo.
 */
export async function signOutToWelcome(): Promise<void> {
	await auth.signOut();
	await goto('/welcome', { replaceState: true });
}
