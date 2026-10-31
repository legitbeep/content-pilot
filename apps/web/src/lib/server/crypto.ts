// Docs: docs/auth-and-keys.md
// AES-256-GCM for BYOK keys. Storage format (same in apps/worker/worker/crypto.py):
// iv = 12 random bytes, ciphertext = encrypted bytes || 16-byte GCM tag. Key = base64 ENCRYPTION_KEY.

async function importKey(keyB64: string): Promise<CryptoKey> {
	const raw = Buffer.from(keyB64, 'base64');
	if (raw.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64-encoded');
	return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(
	plaintext: string,
	keyB64: string
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await importKey(keyB64);
	const ct = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new TextEncoder().encode(plaintext)
	);
	return { iv, ciphertext: new Uint8Array(ct) };
}

export async function decrypt(
	ciphertext: Uint8Array,
	iv: Uint8Array,
	keyB64: string
): Promise<string> {
	const key = await importKey(keyB64);
	const pt = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: new Uint8Array(iv) },
		key,
		new Uint8Array(ciphertext)
	);
	return new TextDecoder().decode(pt);
}

/** Postgres bytea literal for PostgREST writes. */
export const toBytea = (b: Uint8Array) => '\\x' + Buffer.from(b).toString('hex');
