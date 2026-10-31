// Docs: docs/auth-and-keys.md
// Dev-only email/password sign-in for a test user, so agents can load signed-in pages without Google.
import type { SupabaseClient } from '@supabase/supabase-js';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from './supabase-admin';

/** Only `vite dev` with DEV_LOGIN=true. A production build has dev=false, so this is always off. */
export const devLoginEnabled = () => dev && env.DEV_LOGIN === 'true';

/** Ensure the test user exists (secret-key admin API), sign in so session cookies are set, then
 * mark it onboarded so it lands on signed-in pages. Refuses unless devLoginEnabled(). */
export async function devLogin(supabase: SupabaseClient): Promise<string | null> {
	if (!devLoginEnabled()) return 'Dev login is disabled.';
	const email = env.DEV_LOGIN_EMAIL || 'dev@clip-studio.test';
	const password = env.DEV_LOGIN_PASSWORD || 'dev-login-password';
	const admin = supabaseAdmin();
	const { error: createError } = await admin.auth.admin.createUser({
		email,
		password,
		email_confirm: true
	});
	if (createError && createError.code !== 'email_exists') return createError.message;
	const { data, error } = await supabase.auth.signInWithPassword({ email, password });
	if (error) return error.message;
	return completeOnboarding(data.user.id);
}

/** The shell gate ((authed)/(shell)/+layout.server.ts) needs brand_profile.onboarding_completed_at.
 * Idempotent: never overwrites a profile the test user already has (e.g. one made by real
 * onboarding); only fills the completion timestamps when they're missing. */
async function completeOnboarding(userId: string): Promise<string | null> {
	const admin = supabaseAdmin();
	const now = new Date().toISOString();
	const profile = await admin
		.from('brand_profile')
		.upsert(
			{ user_id: userId, answers: { dev_login: true } },
			{ onConflict: 'user_id', ignoreDuplicates: true }
		);
	if (profile.error) return profile.error.message;
	const completed = await admin
		.from('brand_profile')
		.update({ onboarding_completed_at: now })
		.eq('user_id', userId)
		.is('onboarding_completed_at', null);
	if (completed.error) return completed.error.message;
	const onboarded = await admin
		.from('profiles')
		.update({ onboarded_at: now })
		.eq('id', userId)
		.is('onboarded_at', null);
	return onboarded.error?.message ?? null;
}
