/// <reference types="@sveltejs/kit" />

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { writable, derived, get } from 'svelte/store';
import { getSupabaseClient } from './client';

let supabase: SupabaseClient;

function createAuthStore() {
	const { subscribe, set, update } = writable<{
		user: User | null;
		session: any | null;
		loading: boolean;
	}>({
		user: null,
		session: null,
		loading: true
	});

	return {
		subscribe,
		init: async () => {
			if (!browser) return;

			supabase = getSupabaseClient();

			// Get initial session
			const {
				data: { session }
			} = await supabase.auth.getSession();
			
			set({
				user: session?.user ?? null,
				session,
				loading: false
			});

			// Listen for auth changes
			supabase.auth.onAuthStateChange((_event, session) => {
				set({
					user: session?.user ?? null,
					session,
					loading: false
				});
			});
		},
		signOut: async () => {
			if (!supabase) supabase = getSupabaseClient();
			await supabase.auth.signOut();
		}
	};
}

export const auth = createAuthStore();

// Derived store for just the user
export const currentUser = derived(auth, ($auth) => $auth.user);

// Derived store for loading state
export const isLoading = derived(auth, ($auth) => $auth.loading);

// Derived store for authenticated state
export const isAuthenticated = derived(auth, ($auth) => !!$auth.user);