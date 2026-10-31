// Docs: docs/auth-and-keys.md
// BYOK providers shown in Settings. Claude is not here: it is one server-wide token (ADR 0007).
export type Provider = 'deepgram' | 'wispr';

export const providers: { id: Provider; name: string; description: string; required: boolean }[] = [
	{
		id: 'deepgram',
		name: 'Deepgram',
		description: 'Required: transcribes your videos.',
		required: true
	},
	{
		id: 'wispr',
		name: 'Wispr Flow',
		description: 'Optional: voice input in the editor.',
		required: false
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

export const keyStatus = (k: ApiKey): KeyStatus =>
	k.invalid_at ? 'invalid' : k.validated_at ? 'valid' : 'unverified';

/** Providers whose keys must exist before a video can be uploaded. */
export const missingRequired = (keys: ApiKey[]) =>
	providers.filter((p) => p.required && !keys.some((k) => k.provider === p.id));
