// Docs: docs/auth-and-keys.md
// BYOK save flow: validate with one cheap authenticated call → encrypt → upsert into user_keys.
import { env } from '$env/dynamic/private';
import type { Provider } from '$lib/entities/api-key';
import { encrypt, toBytea } from './crypto';
import { validators } from './llm/validate';
import { supabaseAdmin } from './supabase-admin';

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
