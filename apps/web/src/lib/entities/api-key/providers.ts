// Docs: docs/llm.md
// BYOK providers shown in Settings → AI providers, and what each one unlocks. The app never uses a
// server-side AI key (ADR 0008): every AI feature runs on the signed-in user's own keys.
/** Shown when an AI feature has no usable key (server 409, worker job error, UI tooltip). */
export const MISSING_KEY_MESSAGE = 'Add an AI provider key in Settings to use this.';

export type Provider = 'anthropic' | 'gemini' | 'groq' | 'deepgram' | 'wispr';
export type Capability = 'llm' | 'transcription' | 'voice';

export const providers: {
	id: Provider;
	name: string;
	description: string;
	capabilities: Capability[];
}[] = [
	{
		id: 'groq',
		name: 'Groq',
		description: 'AI + transcription. One Groq key covers everything.',
		capabilities: ['llm', 'transcription', 'voice']
	},
	{
		id: 'anthropic',
		name: 'Claude',
		description: 'AI: clip picking, editor agent, captions.',
		capabilities: ['llm']
	},
	{
		id: 'gemini',
		name: 'Gemini',
		description: 'AI: clip picking, editor agent, captions.',
		capabilities: ['llm']
	},
	{
		id: 'deepgram',
		name: 'Deepgram',
		description: 'Transcription with speaker labels.',
		capabilities: ['transcription']
	},
	{
		id: 'wispr',
		name: 'Wispr Flow',
		description: 'Optional: voice input in the editor.',
		capabilities: ['voice']
	}
];

/** Safe columns from the user_keys_public view. */
export type ApiKey = {
	provider: Provider;
	last4: string;
	validated_at: string | null;
	invalid_at: string | null;
	created_at: string;
};

export type KeyStatus = 'valid' | 'unverified' | 'invalid';

export const keyStatus = (k: Pick<ApiKey, 'validated_at' | 'invalid_at'>): KeyStatus =>
	k.invalid_at ? 'invalid' : k.validated_at ? 'valid' : 'unverified';

/** demo = running on the shared demo keys (allowlisted account, ADR 0008): every capability is on
 * and onboarding's key step counts as complete. */
export type AICapabilities = Record<Capability, boolean> & { demo: boolean };

/** Which AI features the user can run. A key counts unless a provider rejected it (invalid_at).
 * Same rule as the server guard `requireAIKeys` and the adapters' key resolution (docs/llm.md).
 * `demo` comes from the server (`isDemoUser`); the shell layout puts the result in page.data.ai. */
export function aiCapabilities(
	keys: Pick<ApiKey, 'provider' | 'invalid_at'>[],
	demo = false
): AICapabilities {
	const usable = keys.filter((k) => !k.invalid_at).map((k) => k.provider);
	const has = (c: Capability) =>
		demo || providers.some((p) => p.capabilities.includes(c) && usable.includes(p.id));
	return { llm: has('llm'), transcription: has('transcription'), voice: has('voice'), demo };
}
