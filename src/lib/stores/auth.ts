import type { Session, User } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { derived, writable, type Readable } from 'svelte/store';
import { supabase } from '$lib/supabase';

export type AuthState = {
	user: User | null;
	session: Session | null;
	loading: boolean;
	initialized: boolean;
};

export type AuthSubscription = {
	unsubscribe: () => void;
};

export type AuthStore = Readable<AuthState> & {
	init: () => Promise<AuthState>;
	signOut: () => Promise<void>;
	destroy: () => void;
};

const initialState: AuthState = {
	user: null,
	session: null,
	loading: browser,
	initialized: false
};

let client: typeof supabase | null = null;
let state = initialState;
let authSubscription: AuthSubscription | null = null;
let initPromise: Promise<AuthState> | null = null;

function createAuthStore(): AuthStore {
	const { subscribe, set } = writable<AuthState>(initialState, () => {
		void store.init();

		return () => undefined;
	});

	const updateState = (
		session: Session | null,
		{ loading = false, initialized = state.initialized } = {}
	) => {
		state = {
			user: session?.user ?? null,
			session,
			loading,
			initialized
		};

		set(state);
	};

	const registerAuthListener = () => {
		if (!client || authSubscription) return;

		const {
			data: { subscription }
		} = client.auth.onAuthStateChange((_event, session) => {
			updateState(session);
		});

		authSubscription = subscription;
	};

	const store = {
		subscribe,
		init: async () => {
			if (!browser) {
				updateState(null, { loading: false, initialized: true });
				return state;
			}

			if (state.initialized) {
				return state;
			}

			if (initPromise) {
				return initPromise;
			}

			client = supabase;
			registerAuthListener();
			updateState(state.session, { loading: true, initialized: false });

			initPromise = client.auth
				.getSession()
				.then(({ data: { session } }) => {
					updateState(session, { loading: false, initialized: true });
					return state;
				})
				.catch((error) => {
					updateState(null, { loading: false, initialized: true });
					console.error('Error getting session:', error);
					return state;
				})
				.finally(() => {
					initPromise = null;
				});

			return initPromise;
		},
		signOut: async () => {
			if (!browser) return;

			await store.init();

			const { error } = await client!.auth.signOut();

			if (error) {
				throw error;
			}
		},
		destroy: () => {
			authSubscription?.unsubscribe();
			authSubscription = null;
			initPromise = null;
			state = initialState;
			set(state);
		}
	};

	return store;
}

export const auth = createAuthStore();
export const currentUser = derived(auth, ($auth) => $auth.user);
export const isLoading = derived(auth, ($auth) => $auth.loading);
export const isAuthenticated = derived(auth, ($auth) => !!$auth.user);
