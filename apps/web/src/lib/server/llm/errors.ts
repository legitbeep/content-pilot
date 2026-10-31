// Docs: docs/llm.md
// Normalised AI errors. Messages are mirrored in apps/worker/worker/llm/errors.py and checked by
// the shared fixtures (packages/llm-registry/fixtures/responses.json).
import { llm, transcription } from '@clip-studio/llm-registry';
import { MISSING_KEY_MESSAGE } from '$lib/entities/api-key';

export { MISSING_KEY_MESSAGE };

/** Display name for a provider id ("groq" → "Groq"). */
export const providerName = (id: string) =>
	(llm as Record<string, { name: string }>)[id]?.name ??
	(transcription as Record<string, { name: string }>)[id]?.name ??
	id;

export type ErrorKind =
	| 'missing_key'
	| 'invalid_key'
	| 'rate_limited'
	| 'overloaded'
	| 'context_too_long'
	| 'content_blocked'
	| 'unknown';

export function messageFor(kind: ErrorKind, name = '', retryAfter: number | null = null): string {
	switch (kind) {
		case 'missing_key':
			return MISSING_KEY_MESSAGE;
		case 'invalid_key':
			return `Your ${name} key was rejected. Update it in Settings.`;
		case 'rate_limited':
			return `Your ${name} key hit its rate limit. Try again in ${
				retryAfter ? `${retryAfter}s` : 'a minute'
			} or switch provider in Settings.`;
		case 'overloaded':
			return `${name} is overloaded right now. Try again in a minute or switch provider in Settings.`;
		case 'context_too_long':
			return `This is too long for ${name}. Try a shorter input or switch provider in Settings.`;
		case 'content_blocked':
			return `${name} refused this content. Try different wording or switch provider in Settings.`;
		default:
			return `${name} returned an error. Try again or switch provider in Settings.`;
	}
}

export class AIError extends Error {
	constructor(
		public kind: ErrorKind,
		public provider: string | null = null,
		public retryAfter: number | null = null,
		/** Technical detail (provider response), never shown as the main message. */
		public detail = '',
		message?: string
	) {
		super(message ?? messageFor(kind, providerName(provider ?? ''), retryAfter));
	}
}
