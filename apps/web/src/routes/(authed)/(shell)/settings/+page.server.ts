import { fail } from '@sveltejs/kit';
import { LLM_PROVIDERS, TASKS, TRANSCRIPTION_PROVIDERS } from '@clip-studio/llm-registry';
import type { ApiKey } from '$lib/entities/api-key';
import { keyActions } from '$lib/server/keys';
import { disconnectYoutube } from '$lib/server/youtube';
import type { Actions, PageServerLoad } from './$types';

export type Connection = {
	platform: string;
	account_name: string | null;
	channel_id: string | null;
	avatar_url: string | null;
	connected_at: string;
};
export type Usage = { provider: string; source: string; calls: number; tokens: number }[];

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	// View exposes safe columns only; ciphertext never leaves the server. RLS scopes all three.
	const since = new Date(Date.now() - 7 * 864e5).toISOString();
	const [keys, settings, calls, connections] = await Promise.all([
		supabase.from('user_keys_public').select('*'),
		supabase.from('ai_settings').select('*').maybeSingle(),
		supabase
			.from('llm_calls')
			.select('provider, key_source, input_tokens, output_tokens')
			.gte('created_at', since),
		supabase.from('platform_connections_public').select('*')
	]);
	if (keys.error) console.error('user_keys_public', keys.error);

	// ponytail: summed in JS; fine for 7 days of one user's calls, use a view if it grows.
	const usage = new Map<string, Usage[number]>();
	for (const c of calls.data ?? []) {
		const k = `${c.provider}:${c.key_source}`;
		const u = usage.get(k) ?? { provider: c.provider, source: c.key_source, calls: 0, tokens: 0 };
		u.calls += 1;
		u.tokens += c.input_tokens + c.output_tokens;
		usage.set(k, u);
	}
	return {
		keys: (keys.data ?? []) as ApiKey[],
		settings: {
			llm_provider: (settings.data?.llm_provider as string | null) ?? null,
			transcription_provider: (settings.data?.transcription_provider as string | null) ?? null,
			task_overrides: (settings.data?.task_overrides ?? {}) as Record<string, string>
		},
		usage: [...usage.values()],
		connections: (connections.data ?? []) as Connection[]
	};
};

/** 'auto' (or anything unknown) → null = let resolution decide (docs/llm.md). */
const pick = (v: FormDataEntryValue | null, allowed: string[]) =>
	typeof v === 'string' && allowed.includes(v) ? v : null;

export const actions: Actions = {
	...keyActions,
	/** Revoke the YouTube refresh token at Google and delete the connection row. */
	disconnect: async ({ locals: { user } }) => {
		try {
			await disconnectYoutube(user!.id);
		} catch (e) {
			console.error('youtube disconnect', e);
			return fail(500, { connectionMessage: 'Could not disconnect YouTube. Try again.' });
		}
		return { disconnected: true };
	},
	/** Default LLM provider, transcription provider and per-task overrides (ai_settings, RLS). */
	prefs: async ({ request, locals: { supabase, user } }) => {
		const form = await request.formData();
		const task_overrides: Record<string, string> = {};
		for (const t of TASKS) {
			const p = pick(form.get(`task:${t}`), LLM_PROVIDERS);
			if (p) task_overrides[t] = p;
		}
		const { error } = await supabase.from('ai_settings').upsert({
			user_id: user!.id,
			llm_provider: pick(form.get('llm_provider'), LLM_PROVIDERS),
			transcription_provider: pick(form.get('transcription_provider'), TRANSCRIPTION_PROVIDERS),
			task_overrides,
			updated_at: new Date().toISOString()
		});
		if (error) return fail(500, { prefsMessage: 'Could not save your AI settings.' });
		return { prefsSaved: true };
	}
};
