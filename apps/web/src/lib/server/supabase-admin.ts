// Docs: docs/auth-and-keys.md
// Secret-key Supabase client (bypasses RLS). Only for user_keys writes; always scope by user_id.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

let client: SupabaseClient | undefined;

export function supabaseAdmin(): SupabaseClient {
	if (!env.SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY is not set (apps/web/.env)');
	client ??= createClient(publicEnv.PUBLIC_SUPABASE_URL ?? '', env.SUPABASE_SECRET_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	return client;
}
