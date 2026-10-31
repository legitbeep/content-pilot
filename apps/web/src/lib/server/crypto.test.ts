import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from './crypto';

// Shared with apps/worker/tests/test_crypto.py: each language decrypts the other's output.
const fx = JSON.parse(
	readFileSync(join(import.meta.dirname, '../../../../../fixtures/crypto.json'), 'utf8')
);
const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

describe('BYOK crypto', () => {
	it('decrypts a value encrypted by the Python worker', async () => {
		const { iv, ciphertext, plaintext } = fx.from_python;
		expect(await decrypt(b64(ciphertext), b64(iv), fx.key)).toBe(plaintext);
	});
	it('decrypts its own fixture entry', async () => {
		const { iv, ciphertext, plaintext } = fx.from_ts;
		expect(await decrypt(b64(ciphertext), b64(iv), fx.key)).toBe(plaintext);
	});
	it('round-trips with a fresh IV', async () => {
		const { iv, ciphertext } = await encrypt('secret', fx.key);
		expect(iv.length).toBe(12);
		expect(await decrypt(ciphertext, iv, fx.key)).toBe('secret');
	});
	it('rejects tampered ciphertext', async () => {
		const { iv, ciphertext } = await encrypt('secret', fx.key);
		ciphertext[0] ^= 1;
		await expect(decrypt(ciphertext, iv, fx.key)).rejects.toThrow();
	});
});
