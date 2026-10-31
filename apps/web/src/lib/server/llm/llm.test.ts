import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/* eslint-disable @typescript-eslint/no-explicit-any -- fake DB + fixtures */

const root = join(import.meta.dirname, '../../../../../..');
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const responses = read('packages/llm-registry/fixtures/responses.json');
const resolution = read('fixtures/key-resolution.json');
const cryptoFx = read('fixtures/crypto.json');

const state = vi.hoisted(() => ({
	env: {} as Record<string, string>,
	keys: [] as { provider: string; invalid_at: string | null; ciphertext?: string; iv?: string }[],
	user: null as any,
	inserts: [] as any[],
	updates: [] as any[]
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('../supabase-admin', () => ({
	supabaseAdmin: () => ({
		auth: { admin: { getUserById: async () => ({ data: { user: state.user } }) } },
		from: (table: string) => {
			let provider = '';
			const q: any = {
				select: () => q,
				gte: () => q,
				eq: (col: string, v: string) => ((provider = col === 'provider' ? v : provider), q),
				maybeSingle: async () => ({ data: null, error: null }),
				single: async () => ({ data: state.keys.find((k) => k.provider === provider) ?? null }),
				insert: async (row: any) => (state.inserts.push({ table, ...row }), { error: null }),
				update: (row: any) => (state.updates.push({ table, ...row }), q),
				then: (res: any) => res({ data: table === 'user_keys' ? state.keys : [], error: null })
			};
			return q;
		}
	})
}));

const { interpret } = await import('./providers');
const { AIError, messageFor, providerName } = await import('./errors');
const { resolveLLM, resolveTranscription, requireAIKeys } = await import('./keys');
const { generateJSON, generateText, timing } = await import('./index');
const { encrypt, toBytea } = await import('../crypto');

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
const sleep = vi.spyOn(timing, 'sleep').mockResolvedValue();

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), { status, headers });
const groqOk = (content: string) =>
	reply(200, {
		choices: [{ message: { content }, finish_reason: 'stop' }],
		usage: { prompt_tokens: 3, completion_tokens: 2 }
	});
async function ownKey(provider: string, key: string) {
	const { iv, ciphertext } = await encrypt(key, cryptoFx.key);
	state.keys.push({ provider, invalid_at: null, iv: toBytea(iv), ciphertext: toBytea(ciphertext) });
}
const opts = { userId: 'u1', task: 'captions' as const, system: 'sys', prompt: 'hi' };

beforeEach(() => {
	for (const k of Object.keys(state.env)) delete state.env[k];
	Object.assign(state.env, {
		ENCRYPTION_KEY: cryptoFx.key,
		// Server keys present on purpose: only allowlisted users may use them.
		GEMINI_API_KEY: 'server-gemini',
		GROQ_API_KEY: 'server-groq',
		ANTHROPIC_API_KEY: 'server-anthropic',
		DEEPGRAM_API_KEY: 'server-deepgram',
		CLAUDE_OAUTH_TOKEN: 'server-oauth',
		DEMO_ALLOWED_EMAILS: 'demo@example.com, other@example.com'
	});
	state.keys = [];
	state.user = { email: 'someone@example.com', email_confirmed_at: '2026-10-31' };
	state.inserts = [];
	state.updates = [];
	fetchMock.mockReset();
	sleep.mockClear();
});

describe('shared provider fixtures', () => {
	it.each(responses.cases as any[])('$name', (c: any) => {
		const r = interpret(c.provider, c.status, c.headers, c.body);
		if ('text' in c.expect) {
			expect(r).toEqual({
				ok: true,
				text: c.expect.text,
				usage: { inputTokens: c.expect.input_tokens, outputTokens: c.expect.output_tokens }
			});
		} else {
			expect(r).toEqual({ ok: false, kind: c.expect.kind, retryAfter: c.expect.retry_after });
			expect(messageFor(c.expect.kind, providerName(c.provider), c.expect.retry_after)).toBe(
				c.expect.message
			);
		}
	});
	it('missing_key message', () => {
		expect(new AIError('missing_key').message).toBe(responses.missing_key_message);
	});
});

describe('shared key-resolution fixtures', () => {
	it.each(resolution.cases as any[])('$name', (c: any) => {
		const ai = {
			usable: c.keys.filter((k: any) => !k.invalid).map((k: any) => k.provider),
			settings: c.settings,
			demo: c.demo
		};
		expect(resolveLLM(ai, c.task)).toEqual(c.llm);
		expect(resolveTranscription(ai)).toEqual(c.transcription);
	});
});

describe('generateText / generateJSON', () => {
	it('missing_key for a non-allowlisted user even with server AI keys in env', async () => {
		const err = await generateText(opts).catch((e) => e);
		expect(err).toBeInstanceOf(AIError);
		expect(err.kind).toBe('missing_key');
		expect(err.message).toBe('Add an AI provider key in Settings to use this.');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('missing_key when the allowlisted email is not verified', async () => {
		state.user = { email: 'demo@example.com', email_confirmed_at: null };
		await expect(generateText(opts)).rejects.toMatchObject({ kind: 'missing_key' });
	});

	it('allowlisted user without keys uses the demo Gemini key', async () => {
		state.user = { email: 'Demo@Example.com', email_confirmed_at: '2026-10-31' };
		fetchMock.mockResolvedValueOnce(reply(200, responses.cases[7].body));
		const r = await generateText(opts);
		expect(r.provider).toBe('gemini');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toContain('generativelanguage.googleapis.com');
		expect(init.headers['x-goog-api-key']).toBe('server-gemini');
		expect(state.inserts[0]).toMatchObject({ table: 'llm_calls', key_source: 'demo', ok: true });
	});

	it('allowlisted user with their own key uses their own key', async () => {
		state.user = { email: 'demo@example.com', email_confirmed_at: '2026-10-31' };
		await ownKey('anthropic', 'own-anthropic');
		fetchMock.mockResolvedValueOnce(reply(200, responses.cases[0].body));
		const r = await generateText(opts);
		expect(r).toMatchObject({ provider: 'anthropic', data: '{"ok": true}' });
		expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('own-anthropic');
		expect(state.inserts[0]).toMatchObject({ key_source: 'user', input_tokens: 12 });
	});

	it('repairs invalid JSON once with the validation error', async () => {
		await ownKey('groq', 'own-groq');
		fetchMock
			.mockResolvedValueOnce(groqOk('{"title": 5}'))
			.mockResolvedValueOnce(groqOk('```json\n{"title": "ok"}\n```'));
		const r = await generateJSON({ ...opts, schema: z.object({ title: z.string() }) });
		expect(r.data).toEqual({ title: 'ok' });
		expect(r.usage).toEqual({ inputTokens: 6, outputTokens: 4 });
		const second = JSON.parse(fetchMock.mock.calls[1][1].body);
		expect(second.messages[1].content).toContain('was not valid');
		expect(second.response_format.type).toBe('json_schema');
	});

	it('gives up readably after one repair', async () => {
		await ownKey('groq', 'own-groq');
		fetchMock.mockImplementation(async () => groqOk('nope'));
		const err = await generateJSON({ ...opts, schema: z.object({ a: z.number() }) }).catch(
			(e) => e
		);
		expect(err.kind).toBe('unknown');
		expect(err.message).toContain("Groq returned an answer we couldn't read");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('retries rate limits with backoff, then succeeds', async () => {
		await ownKey('groq', 'own-groq');
		fetchMock
			.mockResolvedValueOnce(
				reply(429, { error: { message: 'slow down' } }, { 'retry-after': '3' })
			)
			.mockResolvedValueOnce(reply(503, { error: { message: 'busy' } }))
			.mockResolvedValueOnce(groqOk('hello'));
		expect((await generateText(opts)).data).toBe('hello');
		expect(sleep.mock.calls).toEqual([[3000], [2000]]);
	});

	it('stops after 2 retries with the readable message', async () => {
		await ownKey('groq', 'own-groq');
		fetchMock.mockImplementation(async () => reply(503, { error: { message: 'busy' } }));
		await expect(generateText(opts)).rejects.toMatchObject({ kind: 'overloaded' });
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(state.inserts[0]).toMatchObject({ ok: false, error_kind: 'overloaded' });
	});

	it('marks a rejected own key invalid', async () => {
		await ownKey('groq', 'own-groq');
		fetchMock.mockResolvedValueOnce(reply(401, { error: { message: 'Invalid API Key' } }));
		await expect(generateText(opts)).rejects.toMatchObject({ kind: 'invalid_key' });
		expect(state.updates[0]).toMatchObject({ table: 'user_keys' });
	});
});

describe('requireAIKeys', () => {
	it('409 with the missing_key message', async () => {
		const err = await requireAIKeys('u1', 'transcription').catch((e) => e);
		expect(err.status).toBe(409);
		expect(err.body.message).toBe('Add an AI provider key in Settings to use this.');
	});
	it('passes with own keys, flags demo use', async () => {
		state.keys.push({ provider: 'deepgram', invalid_at: null });
		expect(await requireAIKeys('u1', 'transcription')).toEqual({ demo: false });
		await expect(requireAIKeys('u1', 'both')).rejects.toMatchObject({ status: 409 });
		state.user = { email: 'demo@example.com', email_confirmed_at: '2026-10-31' };
		expect(await requireAIKeys('u1', 'both')).toEqual({ demo: true });
	});
});
