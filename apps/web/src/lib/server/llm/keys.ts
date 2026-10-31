// Docs: docs/llm.md
// Which key pays for an AI call. Order: the user's own stored key → the shared demo key, only for
// allowlisted verified emails (DEMO_ALLOWED_EMAILS) → missing_key. ADR 0008. Mirrored in
// apps/worker/worker/llm/keys.py; both run fixtures/key-resolution.json.
// Server keys never leave this module: not sent to the browser, logged, or shown.
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	LLM_PROVIDERS,
	TRANSCRIPTION_PROVIDERS,
	type LLMProvider,
	type Task,
	type TranscriptionProvider
} from '@clip-studio/llm-registry';
import { aiCapabilities, MISSING_KEY_MESSAGE, type Provider } from '$lib/entities/api-key';
import { decrypt, fromBytea } from '../crypto';
import { supabaseAdmin } from '../supabase-admin';
import { AIError } from './errors';

export type AISettings = {
	llm_provider: string | null;
	transcription_provider: string | null;
	task_overrides: Record<string, string>;
};
/** usable = providers with a saved, not-rejected key. demo = allowlisted verified email. */
export type UserAI = { usable: string[]; settings: AISettings; demo: boolean };
export type KeySource = 'user' | 'demo';
export type Resolved<P extends string> = { provider: P; source: KeySource };

const DEFAULTS: AISettings = {
	llm_provider: null,
	transcription_provider: null,
	task_overrides: {}
};
/** Demo defaults: Gemini for LLM, Groq for transcription. */
const DEMO_LLM: LLMProvider = 'gemini';
const DEMO_TRANSCRIPTION: TranscriptionProvider = 'groq';
const DEMO_ENV: Record<string, string> = { gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY' };

/** True only for a confirmed email on DEMO_ALLOWED_EMAILS. Pass a user from the verified session
 * (locals.user) or the admin API, never an email the client sent. */
export function isDemoUser(
	user: { email?: string | null; email_confirmed_at?: string | null } | null
) {
	const allowed = (env.DEMO_ALLOWED_EMAILS ?? '')
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
	return !!user?.email && !!user.email_confirmed_at && allowed.includes(user.email.toLowerCase());
}

export async function loadUserAI(userId: string): Promise<UserAI> {
	const db = supabaseAdmin();
	const [keys, settings, user] = await Promise.all([
		db.from('user_keys').select('provider, invalid_at').eq('user_id', userId),
		db.from('ai_settings').select('*').eq('user_id', userId).maybeSingle(),
		env.DEMO_ALLOWED_EMAILS ? db.auth.admin.getUserById(userId) : null
	]);
	if (keys.error) throw new Error(`user_keys read failed: ${keys.error.message}`);
	return {
		usable: keys.data.filter((k) => !k.invalid_at).map((k) => k.provider),
		settings: { ...DEFAULTS, ...(settings.data ?? {}) },
		demo: isDemoUser(user?.data.user ?? null)
	};
}

function firstUsable<P extends string>(ai: UserAI, all: P[], order: (string | null | undefined)[]) {
	return [...order, ...all].find((p): p is P => all.includes(p as P) && ai.usable.includes(p!));
}

/** Task override → default provider → first usable LLM key → demo (Gemini) → null. */
export function resolveLLM(ai: UserAI, task: Task): Resolved<LLMProvider> | null {
	const own = firstUsable(ai, LLM_PROVIDERS, [
		ai.settings.task_overrides?.[task],
		ai.settings.llm_provider
	]);
	if (own) return { provider: own, source: 'user' };
	return ai.demo ? { provider: DEMO_LLM, source: 'demo' } : null;
}

/** Chosen provider → deepgram → groq → demo (Groq) → null. */
export function resolveTranscription(ai: UserAI): Resolved<TranscriptionProvider> | null {
	const own = firstUsable(ai, TRANSCRIPTION_PROVIDERS, [ai.settings.transcription_provider]);
	if (own) return { provider: own, source: 'user' };
	return ai.demo ? { provider: DEMO_TRANSCRIPTION, source: 'demo' } : null;
}

export async function keyFor(userId: string, r: Resolved<string>): Promise<string> {
	if (r.source === 'demo') {
		const key = env[DEMO_ENV[r.provider]];
		if (!key) throw new AIError('missing_key');
		return key;
	}
	const { data, error: err } = await supabaseAdmin()
		.from('user_keys')
		.select('ciphertext, iv')
		.eq('user_id', userId)
		.eq('provider', r.provider)
		.single();
	if (err || !data) throw new Error(`user_keys read failed: ${err?.message ?? 'no row'}`);
	return decrypt(fromBytea(data.ciphertext), fromBytea(data.iv), env.ENCRYPTION_KEY ?? '');
}

/** The provider rejected the user's key (401/403): Settings shows it as rejected, resolution skips it. */
export async function markInvalid(userId: string, provider: string) {
	await supabaseAdmin()
		.from('user_keys')
		.update({ invalid_at: new Date().toISOString() })
		.eq('user_id', userId)
		.eq('provider', provider);
}

export type Needs = 'llm' | 'transcription' | 'both';

/** Guard for every route that starts AI work. Throws a 409 with the missing_key message
 * (`formAction` and the RequiresAI gate show it as-is). `demo` = a needed capability will run on
 * the shared demo keys; job-creating routes then also call `requireDemoJobQuota`. */
export async function requireAIKeys(userId: string, needs: Needs): Promise<{ demo: boolean }> {
	const ai = await loadUserAI(userId);
	const own = aiCapabilities(ai.usable.map((p) => ({ provider: p as Provider, invalid_at: null })));
	const want = needs === 'both' ? (['llm', 'transcription'] as const) : [needs];
	const lacking = want.filter((c) => !own[c]);
	if (lacking.length && !ai.demo) error(409, MISSING_KEY_MESSAGE);
	return { demo: lacking.length > 0 };
}

/** DEMO_DAILY_JOB_LIMIT (default 10) jobs per UTC day for users on the shared demo keys.
 * Counts the append-only demo_usage log, so deleting a job never frees a slot. */
export async function requireDemoJobQuota(userId: string): Promise<void> {
	const limit = Number(env.DEMO_DAILY_JOB_LIMIT) || 10;
	const since = new Date();
	since.setUTCHours(0, 0, 0, 0);
	const { count, error: err } = await supabaseAdmin()
		.from('demo_usage')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId)
		.eq('kind', 'job')
		.gte('created_at', since.toISOString());
	if (err) throw new Error(`jobs count failed: ${err.message}`);
	if ((count ?? 0) >= limit)
		error(
			429,
			`You've used today's ${limit} demo videos on the shared keys. Add your own key in Settings to keep going, or try again tomorrow.`
		);
}

/** Append one row to demo_usage after a demo-keyed job is created (counted by the cap). */
export async function recordDemoJob(userId: string): Promise<void> {
	const { error: err } = await supabaseAdmin()
		.from('demo_usage')
		.insert({ user_id: userId, kind: 'job' });
	if (err) throw new Error(`demo_usage insert failed: ${err.message}`);
}
