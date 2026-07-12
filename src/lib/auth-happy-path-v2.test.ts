
import { describe, it, expect, vi } from 'vitest';
import { auth } from '$lib/stores/auth';
import { supabase } from '$lib/supabase/client';

describe('Auth Store Happy Path', () => {
    it('initializes correctly', async () => {
        const state = await auth.init();
        expect(state).toBeDefined();
        expect(state.initialized).toBe(true);
    });

    it('has expected methods', () => {
        expect(typeof auth.init).toBe('function');
        expect(typeof auth.signOut).toBe('function');
    });
});
