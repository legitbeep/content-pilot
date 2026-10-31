import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIError } from './errors';
import { transcribeVoice, voiceProvider } from './voice';

const keys = vi.hoisted(() => ({
	loadUserAI: vi.fn(),
	keyFor: vi.fn(async (_u: string, r: { provider: string }) => `key-${r.provider}`),
	markInvalid: vi.fn()
}));
vi.mock('./keys', () => keys);

const wav = new Uint8Array([82, 73, 70, 70]);
const ai = (usable: string[], demo = false) => ({ usable, demo, settings: {} });
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => vi.clearAllMocks());

describe('voiceProvider', () => {
	it('prefers Wispr, then own Groq, then demo Groq', () => {
		expect(voiceProvider(ai(['groq', 'wispr']))?.provider).toBe('wispr');
		expect(voiceProvider(ai(['groq']))).toEqual({ provider: 'groq', source: 'user' });
		expect(voiceProvider(ai([], true))).toEqual({ provider: 'groq', source: 'demo' });
		expect(voiceProvider(ai(['gemini']))).toBeNull();
	});
});

describe('transcribeVoice', () => {
	it('sends base64 16 kHz WAV to Wispr with the org key server side', async () => {
		keys.loadUserAI.mockResolvedValue(ai(['wispr']));
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: ' make it vertical ' })));
		expect(await transcribeVoice('u', wav)).toBe('make it vertical');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://platform-api.wisprflow.ai/api/v1/dash/api');
		expect(init.headers.Authorization).toBe('Bearer key-wispr');
		expect(JSON.parse(init.body)).toMatchObject({ audio: 'UklGRg==', language: ['en'] });
	});
	it('falls back to Groq Whisper', async () => {
		keys.loadUserAI.mockResolvedValue(ai(['groq']));
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: 'hi' })));
		expect(await transcribeVoice('u', wav)).toBe('hi');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
		expect((init.body as FormData).get('model')).toBe('whisper-large-v3-turbo');
	});
	it('marks a rejected own key invalid', async () => {
		keys.loadUserAI.mockResolvedValue(ai(['wispr']));
		fetchMock.mockResolvedValue(new Response('nope', { status: 401 }));
		await expect(transcribeVoice('u', wav)).rejects.toMatchObject({ kind: 'invalid_key' });
		expect(keys.markInvalid).toHaveBeenCalledWith('u', 'wispr');
	});
	it('missing_key without a voice key', async () => {
		keys.loadUserAI.mockResolvedValue(ai([]));
		await expect(transcribeVoice('u', wav)).rejects.toBeInstanceOf(AIError);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
