// Docs: docs/agent.md
// POST audio/wav body (16 kHz mono, recorded in the editor) → { text }. Keys never reach the browser.
import { error, json } from '@sveltejs/kit';
import { AIError, MISSING_KEY_MESSAGE } from '$lib/server/llm';
import { MAX_VOICE_BYTES, transcribeVoice } from '$lib/server/llm/voice';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals: { user } }) => {
	if (!user) error(401, 'Sign in first.');
	if (request.headers.get('content-type') !== 'audio/wav') error(400, 'Send a WAV recording.');
	const wav = new Uint8Array(await request.arrayBuffer());
	if (!wav.length) error(400, 'The recording was empty.');
	if (wav.length > MAX_VOICE_BYTES) error(413, 'Keep voice messages under 3 minutes.');
	try {
		return json({ text: await transcribeVoice(user.id, wav) });
	} catch (e) {
		if (!(e instanceof AIError)) throw e;
		error(
			e.kind === 'missing_key' ? 409 : 502,
			e.kind === 'missing_key' ? MISSING_KEY_MESSAGE : e.message
		);
	}
};
