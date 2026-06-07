import { createClient } from '@supabase/supabase-js';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';

function createSupabaseClient(): SupabaseClient<Database> {
	const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
	const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error(
			'Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
		);
	}

	return createClient<Database>(supabaseUrl, supabaseAnonKey);
}

export const supabase = createSupabaseClient();

export async function getSession(): Promise<Session | null> {
	const {
		data: { session }
	} = await supabase.auth.getSession();

	return session;
}

export async function getUser(): Promise<User | null> {
	const session = await getSession();
	return session?.user ?? null;
}
