// Docs: docs/llm.md
// Voice input for the editor agent (plan 7): a short 16 kHz mono WAV recorded in the browser →
// text. Wispr Flow (user's org key) when saved, else Groq Whisper (user's key, or demo Groq).
// Keys stay here; the browser only posts audio to /api/editor/voice.
import { transcription } from '@clip-studio/llm-registry';
import { AIError, USER_AGENT } from './errors';
import { keyFor, loadUserAI, markInvalid, type Resolved } from './keys';

const WISPR_URL = 'https://platform-api.wisprflow.ai/api/v1/dash/api';
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
export const MAX_VOICE_BYTES = 6 * 1024 * 1024; // ~3 min of 16 kHz 16-bit mono

/** Which provider voice uses: wispr → groq (own) → groq (demo) → null. */
export function voiceProvider(ai: { usable: string[]; demo: boolean }): Resolved<string> | null {
	if (ai.usable.includes('wispr')) return { provider: 'wispr', source: 'user' };
	if (ai.usable.includes('groq')) return { provider: 'groq', source: 'user' };
	return ai.demo ? { provider: 'groq', source: 'demo' } : null;
}

async function failFor(res: Response, userId: string, r: Resolved<string>, name: string) {
	const detail = (await res.text().catch(() => '')).slice(0, 500);
	if ((res.status === 401 || res.status === 403) && !/error code: 10\d\d/.test(detail)) {
		if (r.source === 'user') await markInvalid(userId, r.provider);
		return new AIError(
			'invalid_key',
			r.provider,
			null,
			detail,
			`Your ${name} key was rejected. Update it in Settings.`
		);
	}
	if (res.status === 429)
		return new AIError(
			'rate_limited',
			r.provider,
			null,
			detail,
			`${name} is busy. Try again in a minute, or type instead.`
		);
	return new AIError(
		'unknown',
		r.provider,
		null,
		detail,
		`${name} couldn't transcribe that. Try again, or type instead.`
	);
}

export async function transcribeVoice(userId: string, wav: Uint8Array): Promise<string> {
	const r = voiceProvider(await loadUserAI(userId));
	if (!r) throw new AIError('missing_key');
	const key = await keyFor(userId, r);
	if (r.provider === 'wispr') {
		const res = await fetch(WISPR_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${key}`,
				'content-type': 'application/json',
				'user-agent': USER_AGENT
			},
			body: JSON.stringify({
				audio: Buffer.from(wav).toString('base64'),
				language: ['en'],
				context: { app: { type: 'ai' } }
			})
		});
		if (!res.ok) throw await failFor(res, userId, r, 'Wispr Flow');
		return String(((await res.json()) as { text?: string }).text ?? '').trim();
	}
	const form = new FormData();
	form.append('file', new Blob([wav as BlobPart], { type: 'audio/wav' }), 'voice.wav');
	form.append('model', transcription.groq.model);
	form.append('response_format', 'json');
	const res = await fetch(GROQ_URL, {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'user-agent': USER_AGENT },
		body: form
	});
	if (!res.ok) throw await failFor(res, userId, r, 'Groq');
	return String(((await res.json()) as { text?: string }).text ?? '').trim();
}
