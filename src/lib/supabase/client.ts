import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient;

export function createSupabaseClient() {
	const supabaseUrl = import.meta.env.SUPABASE_URL;
	const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.');
	}

	supabase = createClient(supabaseUrl, supabaseAnonKey);
	return supabase;
}

export function getSupabaseClient(): SupabaseClient {
	if (!supabase) {
		supabase = createSupabaseClient();
	}
	return supabase;
}

export const supabase = getSupabaseClient();