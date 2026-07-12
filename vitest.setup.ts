import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock $app/* modules globally — evita que vitest intente resolver
// los módulos virtuales de SvelteKit (__sveltekit, etc.)
vi.mock('$app/environment', () => ({
	browser: true,
	dev: true,
	building: false,
	version: 'test'
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidateAll: vi.fn(),
	invalidate: vi.fn(),
	prefetch: vi.fn(),
	prefetchRoutes: vi.fn(),
	beforeNavigate: vi.fn(),
	afterNavigate: vi.fn()
}));

vi.mock('$app/paths', () => ({
	base: '',
	assets: '/'
}));

vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	return {
		page: writable({ url: new URL('http://localhost'), params: {}, route: { id: null } }),
		navigating: writable(null),
		updated: writable(false),
		getStores: () => null,
		getContext: () => null
	};
});

vi.mock('$app/forms', () => ({
	enhance: vi.fn(),
	applyAction: vi.fn(),
	deserialize: vi.fn()
}));

vi.mock('$lib/supabase/client', () => ({
	supabase: {
		auth: {
			signInWithPassword: vi.fn(),
			signUp: vi.fn(),
			signOut: vi.fn(),
			getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
			onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
		},
		from: vi.fn()
	}
}));
