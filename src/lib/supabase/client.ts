import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { supabaseRealtimeTransport } from '$lib/supabase/realtime-transport';

// ⚠️ REEMPLAZA ESTE VALOR con tu clave 'anon public' del dashboard de Supabase.
// Esta clave es segura para el frontend, no tiene permisos de admin.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient<Database> = createClient<Database>(
	supabaseUrl,
	supabaseAnonKey,
	{
		realtime: {
			transport: supabaseRealtimeTransport
		}
	}
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
