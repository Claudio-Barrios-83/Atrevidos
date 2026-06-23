import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient<Database> = createClient<Database>(
	supabaseUrl,
	supabaseAnonKey
);

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
