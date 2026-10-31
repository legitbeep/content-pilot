// Docs: docs/llm.md
// The ONE LLM interface for web code. Callers name a task, never a model or provider:
//   generateText({ userId, task, system, prompt })
//   generateJSON({ userId, task, schema, system, prompt })   (schema = zod)
// Mirrored in apps/worker/worker/llm. Never import a provider SDK or call a provider API elsewhere.
import { z } from 'zod';
import { modelFor, type LLMProvider, type Task } from '@clip-studio/llm-registry';
import { supabaseAdmin } from '../supabase-admin';
import { AIError, providerName } from './errors';
import { keyFor, loadUserAI, markInvalid, resolveLLM, type KeySource } from './keys';
import { buildRequest, interpret, type CallRequest, type Usage } from './providers';

export { AIError, MISSING_KEY_MESSAGE, type ErrorKind } from './errors';
export { isDemoUser, recordDemoJob, requireAIKeys, requireDemoJobQuota, type Needs } from './keys';

export type GenerateOptions = { userId: string; task: Task; system: string; prompt: string };
export type GenerateResult<T> = {
	data: T;
	provider: LLMProvider;
	model: string;
	usage: Usage;
	latencyMs: number;
};

/** Test seam: retries wait through this. */
export const timing = { sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };

const MAX_RETRIES = 2; // rate_limited / overloaded
const MAX_WAIT_S = 20; // a longer retry-after fails fast with the readable message instead

export async function generateText(o: GenerateOptions): Promise<GenerateResult<string>> {
	return run(o, undefined);
}

export async function generateJSON<T>(
	o: GenerateOptions & { schema: z.ZodType<T> }
): Promise<GenerateResult<T>> {
	return run(o, o.schema);
}

/** Input budget for the provider this task would use now. Long inputs (transcripts) must chunk. */
export async function maxInputTokens(userId: string, task: Task): Promise<number> {
	const r = resolveLLM(await loadUserAI(userId), task);
	if (!r) throw new AIError('missing_key');
	return modelFor(r.provider, task).max_input_tokens;
}

async function run<T>(o: GenerateOptions, schema: z.ZodType<T> | undefined) {
	const resolved = resolveLLM(await loadUserAI(o.userId), o.task);
	if (!resolved) throw new AIError('missing_key');
	const { provider, source } = resolved;
	const tier = modelFor(provider, o.task);
	const started = Date.now();
	const usage: Usage = { inputTokens: 0, outputTokens: 0 };
	const log = (ok: boolean, errorKind: string | null = null) =>
		logCall({
			userId: o.userId,
			provider,
			source,
			model: tier.model,
			task: o.task,
			usage,
			started,
			ok,
			errorKind
		});

	try {
		const req: CallRequest = {
			key: await keyFor(o.userId, resolved),
			tier,
			system: o.system,
			prompt: o.prompt
		};
		let data: T;
		if (!schema) {
			data = (await send(provider, req, usage)) as T;
		} else {
			const jsonSchema = z.toJSONSchema(schema);
			req.schema = jsonSchema;
			req.system += `\n\nReply with only a JSON value (no prose, no code fences) matching this JSON Schema:\n${JSON.stringify(jsonSchema)}`;
			let text = await send(provider, req, usage);
			let parsed = parseJSON(text, schema);
			if (!parsed.ok) {
				// One repair attempt with the validation error, then give up readably.
				req.prompt = `${o.prompt}\n\nYour previous reply was not valid: ${parsed.error}\nPrevious reply:\n${text}\n\nReply again with only the corrected JSON.`;
				text = await send(provider, req, usage);
				parsed = parseJSON(text, schema);
			}
			if (!parsed.ok)
				throw new AIError(
					'unknown',
					provider,
					null,
					parsed.error,
					`${providerName(provider)} returned an answer we couldn't read. Try again or switch provider in Settings.`
				);
			data = parsed.data;
		}
		await log(true);
		return { data, provider, model: tier.model, usage, latencyMs: Date.now() - started };
	} catch (e) {
		const kind = e instanceof AIError ? e.kind : 'unknown';
		if (kind === 'invalid_key' && source === 'user') await markInvalid(o.userId, provider);
		await log(false, kind);
		throw e;
	}
}

async function send(provider: LLMProvider, req: CallRequest, usage: Usage): Promise<string> {
	for (let attempt = 0; ; attempt++) {
		const { url, init } = buildRequest(provider, req);
		let res: Response;
		try {
			res = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
		} catch (e) {
			throw new AIError('unknown', provider, null, String(e));
		}
		const raw = await res.text();
		let body: unknown = raw;
		try {
			body = JSON.parse(raw);
		} catch {
			/* non-JSON error page: keep the text */
		}
		const r = interpret(provider, res.status, Object.fromEntries(res.headers), body);
		if (r.ok) {
			usage.inputTokens += r.usage.inputTokens;
			usage.outputTokens += r.usage.outputTokens;
			return r.text;
		}
		const retry =
			(r.kind === 'rate_limited' || r.kind === 'overloaded') &&
			attempt < MAX_RETRIES &&
			(r.retryAfter ?? 0) <= MAX_WAIT_S;
		if (!retry) throw new AIError(r.kind, provider, r.retryAfter, raw.slice(0, 2000));
		await timing.sleep((r.retryAfter ?? 2 ** attempt) * 1000);
	}
}

/** Tolerates code fences / leading prose, then validates. */
export function parseJSON<T>(
	text: string,
	schema: z.ZodType<T>
): { ok: true; data: T } | { ok: false; error: string } {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1];
	const s = (fenced ?? text).trim();
	const start = s.search(/[[{]/);
	const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
	let value: unknown;
	try {
		value = JSON.parse(start >= 0 && end > start ? s.slice(start, end + 1) : s);
	} catch (e) {
		return { ok: false, error: `not JSON (${(e as Error).message})` };
	}
	const r = schema.safeParse(value);
	return r.success ? { ok: true, data: r.data } : { ok: false, error: z.prettifyError(r.error) };
}

async function logCall(c: {
	userId: string;
	provider: string;
	source: KeySource;
	model: string;
	task: string;
	usage: Usage;
	started: number;
	ok: boolean;
	errorKind: string | null;
}) {
	const { error } = await supabaseAdmin()
		.from('llm_calls')
		.insert({
			user_id: c.userId,
			provider: c.provider,
			key_source: c.source,
			model: c.model,
			task: c.task,
			input_tokens: c.usage.inputTokens,
			output_tokens: c.usage.outputTokens,
			latency_ms: Date.now() - c.started,
			ok: c.ok,
			error_kind: c.errorKind
		});
	if (error) console.error('llm_calls insert', error.message); // never fail the call over the log
}
