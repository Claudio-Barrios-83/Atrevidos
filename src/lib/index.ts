export { supabase, getSession, getUser } from '$lib/supabase/client';
export { auth, currentUser, isAuthenticated, isLoading, type AuthState, type AuthStore } from './stores/auth';
export type * from './types';
