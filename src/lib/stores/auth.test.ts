import { describe, it, expect, vi } from 'vitest';
import { auth } from './auth';

// Mock supabase client to avoid real connections in tests
vi.mock('$lib/supabase/client', () => ({
    supabase: {
        auth: {
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
            getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
            signOut: vi.fn(() => Promise.resolve({ error: null }))
        }
    }
}));

describe('auth store', () => {
	it('should initialize with default state', async () => {
		const state = await auth.init();
		expect(state.initialized).toBe(true);
		expect(state.session).toBeNull();
	});
});
