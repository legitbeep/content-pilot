import { fail } from '@sveltejs/kit';
import { providers, type ApiKey, type Provider } from '$lib/entities/api-key';
import { removeKey, saveKey } from '$lib/server/keys';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	// View exposes safe columns only; ciphertext never leaves the server.
	const { data, error } = await supabase.from('user_keys_public').select('*');
	if (error) console.error('user_keys_public', error);
	return { keys: (data ?? []) as ApiKey[] };
};

const isProvider = (v: unknown): v is Provider => providers.some((p) => p.id === v);

export const actions: Actions = {
	save: async ({ request, locals: { user } }) => {
		const form = await request.formData();
		const provider = form.get('provider');
		const key = String(form.get('key') ?? '').trim();
		if (!isProvider(provider)) return fail(400, { provider, message: 'Unknown provider.' });
		if (key.length < 8 || key.length > 500)
			return fail(400, { provider, message: 'That does not look like an API key.' });

		const result = await saveKey(user!.id, provider, key);
		if (result === 'invalid')
			return fail(400, {
				provider,
				message:
					provider === 'wispr'
						? 'Wispr rejected this key. Try another, or skip voice input.'
						: 'Deepgram rejected this key. Check it and try again.'
			});
		return { provider, result };
	},
	remove: async ({ request, locals: { user } }) => {
		const provider = (await request.formData()).get('provider');
		if (!isProvider(provider)) return fail(400, { provider, message: 'Unknown provider.' });
		await removeKey(user!.id, provider);
		return { provider, result: 'removed' as const };
	}
};
