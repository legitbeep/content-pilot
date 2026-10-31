// Docs: docs/auth-and-keys.md
// Judge access codes: a 6-digit code signs in its own persistent test account, no Google needed.
import { timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from './supabase-admin';

// `.test` is a reserved TLD, so no Google account can ever own one of these addresses.
const EMAIL = /^judge-\d+@clip-studio\.test$/;
const emailFor = (index: number) => `judge-${index + 1}@clip-studio.test`;

/** ACCESS_CODES = comma-separated 6-digit codes. Code n (1-based) owns judge-n@clip-studio.test,
 * so keep the order stable or judges lose their data. */
const codes = () =>
	(env.ACCESS_CODES ?? '')
		.split(',')
		.map((c) => c.trim())
		.filter((c) => /^\d{6}$/.test(c));

export const accessCodesEnabled = () => codes().length > 0;

/** Judge accounts get the demo AI keys (only this module's admin calls can create them).
 * Mirrored in apps/worker/worker/llm/keys.py. */
export const isAccessCodeEmail = (email: string) => EMAIL.test(email.toLowerCase());

function indexOf(code: string) {
	const given = Buffer.from(code.padEnd(6).slice(0, 6));
	// Compare against every code (no early exit) so timing doesn't leak which prefix matched.
	let found = -1;
	codes().forEach((c, i) => {
		if (timingSafeEqual(Buffer.from(c), given)) found = i;
	});
	return found;
}

// ponytail: per-instance memory, so the cap is per serverless instance; move to a table if abused.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60_000;

function limited(key: string) {
	const now = Date.now();
	const a = attempts.get(key);
	if (!a || a.resetAt < now) {
		attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
		return false;
	}
	return ++a.count > MAX_ATTEMPTS;
}

/** Validate the code, ensure its account exists, then sign in on the request's client (sets the
 * normal session cookies). Onboarding is left to the user. Returns an error message or null. */
export async function accessCodeLogin(
	supabase: SupabaseClient,
	code: string,
	clientKey: string
): Promise<string | null> {
	if (!accessCodesEnabled()) return 'Access codes are turned off.';
	if (limited(clientKey)) return 'Too many attempts. Try again in 15 minutes.';
	const index = /^\d{6}$/.test(code) ? indexOf(code) : -1;
	if (index < 0) return 'That code didn’t work. Check it and try again.';

	const email = emailFor(index);
	const admin = supabaseAdmin();
	const created = await admin.auth.admin.createUser({ email, email_confirm: true });
	if (created.error && created.error.code !== 'email_exists') return created.error.message;
	// Passwordless: mint a one-time magic-link token server side and redeem it right away.
	const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
	if (link.error) return link.error.message;
	const { error } = await supabase.auth.verifyOtp({
		token_hash: link.data.properties.hashed_token,
		type: 'email'
	});
	return error?.message ?? null;
}
