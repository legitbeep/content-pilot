// Docs: docs/auth-and-keys.md
// BYOK save flow: validate with one cheap authenticated call → encrypt → upsert into user_keys.
import { fail, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { providers, type Provider } from '$lib/entities/api-key';
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

const isProvider = (v: unknown): v is Provider => providers.some((p) => p.id === v);

/** `?/save` and `?/remove` form actions behind ApiKeyRow; used by Settings and onboarding step 1. */
export const keyActions = {
	save: async ({ request, locals: { user } }: RequestEvent) => {
		const form = await request.formData();
		const provider = form.get('provider');
		const key = String(form.get('key') ?? '').trim();
		if (!isProvider(provider)) return fail(400, { provider, message: 'Unknown provider.' });
		if (key.length < 8 || key.length > 500)
			return fail(400, { provider, message: 'That does not look like an API key.' });

		const result = await saveKey(user!.id, provider, key);
		const name = providers.find((p) => p.id === provider)!.name;
		if (result === 'invalid')
			return fail(400, {
				provider,
				message:
					provider === 'wispr'
						? 'Wispr rejected this key. Try another, or skip voice input.'
						: `${name} rejected this key. Check it and try again.`
			});
		return { provider, result };
	},
	remove: async ({ request, locals: { user } }: RequestEvent) => {
		const provider = (await request.formData()).get('provider');
		if (!isProvider(provider)) return fail(400, { provider, message: 'Unknown provider.' });
		await removeKey(user!.id, provider);
		return { provider, result: 'removed' as const };
	}
};
