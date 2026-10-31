// Docs: docs/auth-and-keys.md
// BYOK save flow: validate with one cheap authenticated call → encrypt → upsert into user_keys.
import { env } from '$env/dynamic/private';
import type { Provider } from '$lib/entities/api-key';
import { encrypt, toBytea } from './crypto';
import { supabaseAdmin } from './supabase-admin';

export type Validation = 'valid' | 'invalid' | 'unverified';

/** 401/403 → invalid (save rejected); network error, 5xx, timeout → unverified (saved). */
async function check(req: () => Promise<Response>): Promise<Validation> {
	try {
		const res = await req();
		if (res.ok) return 'valid';
		if (res.status === 401 || res.status === 403) return 'invalid';
		return 'unverified';
	} catch {
		return 'unverified';
	}
}

const validators: Record<Provider, (key: string, userId: string) => Promise<Validation>> = {
	// GET /v1/projects: cheapest authenticated call, no usage.
	deepgram: (key) =>
		check(() =>
			fetch('https://api.deepgram.com/v1/projects', {
				headers: { Authorization: `Token ${key}` },
				signal: AbortSignal.timeout(8000)
			})
		),
	// Mints a 60s client token; no audio is sent. Only 401 rejects (docs/auth-and-keys.md).
	wispr: (key, userId) =>
		check(() =>
			fetch('https://platform-api.wisprflow.ai/api/v1/dash/generate_access_token', {
				method: 'POST',
				headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ client_id: userId, duration_secs: 60 }),
				signal: AbortSignal.timeout(8000)
			})
		)
};

export async function saveKey(userId: string, provider: Provider, key: string) {
	const validation = await validators[provider](key, userId);
	if (validation === 'invalid') return validation;

	const { iv, ciphertext } = await encrypt(key, env.ENCRYPTION_KEY ?? '');
	const { error } = await supabaseAdmin()
		.from('user_keys')
		.upsert(
			{
				user_id: userId,
				provider,
				iv: toBytea(iv),
				ciphertext: toBytea(ciphertext),
				last4: key.slice(-4),
				validated_at: validation === 'valid' ? new Date().toISOString() : null,
				invalid_at: null
			},
			{ onConflict: 'user_id,provider' }
		);
	if (error) throw new Error(`user_keys upsert failed: ${error.message}`);
	return validation;
}

export async function removeKey(userId: string, provider: Provider) {
	const { error } = await supabaseAdmin()
		.from('user_keys')
		.delete()
		.eq('user_id', userId)
		.eq('provider', provider);
	if (error) throw new Error(`user_keys delete failed: ${error.message}`);
}
