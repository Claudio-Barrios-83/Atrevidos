import { vi } from 'vitest';
export const supabase = {
    auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn()
    }
};
