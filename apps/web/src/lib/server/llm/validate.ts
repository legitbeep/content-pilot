// Docs: docs/llm.md
// Save-time key check: one cheap authenticated call per provider (checked 2026-10-31, docs/llm.md).
import type { Provider } from '$lib/entities/api-key';

export type Validation = 'valid' | 'invalid' | 'unverified';

/** `rejects` statuses → invalid (save refused); network error, 5xx, timeout → unverified (saved). */
async function check(url: string, init: RequestInit, rejects = [401, 403]): Promise<Validation> {
	try {
		const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
		if (res.ok) return 'valid';
		return rejects.includes(res.status) ? 'invalid' : 'unverified';
	} catch {
		return 'unverified';
	}
}

export const validators: Record<Provider, (key: string, userId: string) => Promise<Validation>> = {
	// List models: no tokens used.
	anthropic: (key) =>
		check('https://api.anthropic.com/v1/models?limit=1', {
			headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
		}),
	// A bad Gemini key comes back as 400 INVALID_ARGUMENT, so 400 rejects too.
	gemini: (key) =>
		check(
			'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
			{ headers: { 'x-goog-api-key': key } },
			[400, 401, 403]
		),
	groq: (key) =>
		check('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } }),
	deepgram: (key) =>
		check('https://api.deepgram.com/v1/projects', { headers: { Authorization: `Token ${key}` } }),
	// Mints a 60s client token; no audio is sent. Only 401 rejects (docs/auth-and-keys.md).
	wispr: (key, userId) =>
		check(
			'https://platform-api.wisprflow.ai/api/v1/dash/generate_access_token',
			{
				method: 'POST',
				headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ client_id: userId, duration_secs: 60 })
			},
			[401]
		)
};
