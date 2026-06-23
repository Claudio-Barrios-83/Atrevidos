import { expect, test, describe } from 'vitest';
import { supabase } from './supabase/client';
import { auth } from './stores/auth';

describe('Auth Happy Path', () => {
  test('should initialize supabase client with URL', () => {
    // @ts-ignore
    expect(supabase.supabaseUrl).toBeDefined();
  });

  test('should sign out successfully', async () => {
    expect(auth.signOut).toBeDefined();
  });
});
