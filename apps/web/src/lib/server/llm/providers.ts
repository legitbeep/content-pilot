// Docs: docs/llm.md
// Raw HTTP per LLM provider (no SDKs): build the request, interpret the response. Mirrored in
// apps/worker/worker/llm/providers.py; both run packages/llm-registry/fixtures/responses.json.
import type { LLMProvider, TierInfo } from '@clip-studio/llm-registry';
import type { ErrorKind } from './errors';

export type Usage = { inputTokens: number; outputTokens: number };
export type CallRequest = {
	key: string;
	tier: TierInfo;
	system: string;
	prompt: string;
	/** JSON Schema of the expected output → provider-native JSON mode (registry `json_mode`). */
	schema?: object;
};
export type Interpreted =
	| { ok: true; text: string; usage: Usage }
	| { ok: false; kind: ErrorKind; retryAfter: number | null };

/* eslint-disable @typescript-eslint/no-explicit-any -- provider JSON is untyped */

export function buildRequest(
	provider: LLMProvider,
	r: CallRequest
): { url: string; init: RequestInit } {
	const json = (headers: Record<string, string>, body: unknown): RequestInit => ({
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(body)
	});
	switch (provider) {
		case 'anthropic':
			// JSON comes from instructions in `system`; the adapter validates and repairs (docs/llm.md).
			return {
				url: 'https://api.anthropic.com/v1/messages',
				init: json(
					{ 'x-api-key': r.key, 'anthropic-version': '2023-06-01' },
					{
						model: r.tier.model,
						max_tokens: r.tier.max_output_tokens,
						system: r.system,
						messages: [{ role: 'user', content: r.prompt }]
					}
				)
			};
		case 'gemini':
			return {
				url: `https://generativelanguage.googleapis.com/v1beta/models/${r.tier.model}:generateContent`,
				init: json(
					{ 'x-goog-api-key': r.key },
					{
						systemInstruction: { parts: [{ text: r.system }] },
						contents: [{ role: 'user', parts: [{ text: r.prompt }] }],
						generationConfig: {
							maxOutputTokens: r.tier.max_output_tokens,
							...(r.schema && { responseMimeType: 'application/json' })
						}
					}
				)
			};
		case 'groq':
			return {
				url: 'https://api.groq.com/openai/v1/chat/completions',
				init: json(
					{ authorization: `Bearer ${r.key}` },
					{
						model: r.tier.model,
						max_completion_tokens: r.tier.max_output_tokens,
						messages: [
							{ role: 'system', content: r.system },
							{ role: 'user', content: r.prompt }
						],
						// Best-effort (strict: false): strict mode rejects common schema shapes.
						...(r.schema && {
							response_format: {
								type: 'json_schema',
								json_schema: { name: 'output', schema: r.schema, strict: false }
							}
						})
					}
				)
			};
	}
}

const BLOCKED_GEMINI = ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY'];

function parseOk(provider: LLMProvider, b: any): { text: string; usage: Usage } | null {
	switch (provider) {
		case 'anthropic':
			if (b.stop_reason === 'refusal') return null;
			return {
				text: (b.content ?? [])
					.filter((c: any) => c.type === 'text')
					.map((c: any) => c.text)
					.join(''),
				usage: {
					inputTokens: b.usage?.input_tokens ?? 0,
					outputTokens: b.usage?.output_tokens ?? 0
				}
			};
		case 'gemini': {
			const c = b.candidates?.[0];
			if (b.promptFeedback?.blockReason || !c || BLOCKED_GEMINI.includes(c.finishReason))
				return null;
			const u = b.usageMetadata ?? {};
			return {
				text: (c.content?.parts ?? [])
					.filter((p: any) => !p.thought && typeof p.text === 'string')
					.map((p: any) => p.text)
					.join(''),
				usage: {
					inputTokens: u.promptTokenCount ?? 0,
					outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)
				}
			};
		}
		case 'groq': {
			const c = b.choices?.[0];
			if (!c || c.finish_reason === 'content_filter') return null;
			return {
				text: c.message?.content ?? '',
				usage: {
					inputTokens: b.usage?.prompt_tokens ?? 0,
					outputTokens: b.usage?.completion_tokens ?? 0
				}
			};
		}
	}
}

/** Seconds from a `retry-after` header or Gemini's RetryInfo ("17s"). */
function retryAfterOf(headers: Record<string, string>, b: any): number | null {
	const h = Number(headers['retry-after']);
	if (h > 0) return Math.ceil(h);
	const info = (b?.error?.details ?? []).find((d: any) => d?.retryDelay);
	const s = info ? parseFloat(info.retryDelay) : NaN;
	return s > 0 ? Math.ceil(s) : null;
}

const TOO_LONG =
	/prompt is too long|context_length_exceeded|context length|maximum number of tokens|too many tokens|reduce the length/;
const BAD_KEY = /api key not valid|api_key_invalid|invalid api key|invalid x-api-key/;

/** One HTTP response → text + usage, or a normalised error kind. `headers` keys are lowercase. */
export function interpret(
	provider: LLMProvider,
	status: number,
	headers: Record<string, string>,
	body: unknown
): Interpreted {
	if (status >= 200 && status < 300) {
		const parsed = parseOk(provider, body);
		return parsed
			? { ok: true, ...parsed }
			: { ok: false, kind: 'content_blocked', retryAfter: null };
	}
	const text = JSON.stringify(body ?? '').toLowerCase();
	const fail = (kind: ErrorKind, retryAfter: number | null = null): Interpreted => ({
		ok: false,
		kind,
		retryAfter
	});
	if (status === 401 || status === 403 || (status === 400 && BAD_KEY.test(text)))
		return fail('invalid_key');
	if (status === 429) return fail('rate_limited', retryAfterOf(headers, body));
	if (status === 413 || TOO_LONG.test(text)) return fail('context_too_long');
	if ([498, 502, 503, 504, 529].includes(status))
		return fail('overloaded', retryAfterOf(headers, body));
	return fail('unknown');
}
