// Docs: docs/auth-and-keys.md
// Dev-only email/password sign-in for a test user, so agents can load signed-in pages without Google.
import type { SupabaseClient } from '@supabase/supabase-js';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from './supabase-admin';

/** Only `vite dev` with DEV_LOGIN=true. A production build has dev=false, so this is always off. */
export const devLoginEnabled = () => dev && env.DEV_LOGIN === 'true';

/** Ensure the test user exists (secret-key admin API), then sign in so session cookies are set. */
export async function devLogin(supabase: SupabaseClient): Promise<string | null> {
	const email = env.DEV_LOGIN_EMAIL || 'dev@clip-studio.test';
	const password = env.DEV_LOGIN_PASSWORD || 'dev-login-password';
	const { error: createError } = await supabaseAdmin().auth.admin.createUser({
		email,
		password,
		email_confirm: true
	});
	if (createError && createError.code !== 'email_exists') return createError.message;
	const { error } = await supabase.auth.signInWithPassword({ email, password });
	return error?.message ?? null;
}
