import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({}) as Record<string, string>);
vi.mock('$env/dynamic/private', () => ({ env }));
const admin = vi.hoisted(() => ({
	created: [] as string[],
	auth: {
		admin: {
			createUser: async ({ email }: { email: string }) => (
				admin.created.push(email),
				{ error: null }
			),
			generateLink: async () => ({ data: { properties: { hashed_token: 'h' } }, error: null })
		}
	}
}));
vi.mock('./supabase-admin', () => ({ supabaseAdmin: () => admin }));

const { accessCodeLogin, accessCodesEnabled, isAccessCodeEmail } = await import('./access-codes');
const verifyOtp = vi.fn(async () => ({ error: null }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = { auth: { verifyOtp } } as any;
let ip = 0;
const login = (code: string) => accessCodeLogin(supabase, code, `ip-${ip}`);

describe('access codes', () => {
	beforeEach(() => {
		env.ACCESS_CODES = '111111, 222222,bad,333333';
		admin.created.length = 0;
		verifyOtp.mockClear();
		ip++;
	});

	it('signs a code into its own judge account', async () => {
		expect(await login('222222')).toBeNull();
		expect(admin.created).toEqual(['judge-2@clip-studio.test']);
		expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'h', type: 'email' });
	});

	it('rejects wrong or malformed codes without touching auth', async () => {
		for (const c of ['123456', '22222', '2222222', '', 'abcdef']) {
			expect(await login(c)).toMatch(/didn’t work/);
		}
		expect(admin.created).toEqual([]);
	});

	it('caps attempts per client', async () => {
		for (let i = 0; i < 10; i++) await login('000000');
		expect(await login('111111')).toMatch(/Too many attempts/);
	});

	it('is off with no codes configured', async () => {
		env.ACCESS_CODES = '';
		expect(accessCodesEnabled()).toBe(false);
		expect(await login('111111')).toMatch(/turned off/);
	});

	it('recognises only judge emails on the reserved .test domain', () => {
		expect(isAccessCodeEmail('Judge-4@clip-studio.test')).toBe(true);
		expect(isAccessCodeEmail('judge-4@clip-studio.test.evil.com')).toBe(false);
		expect(isAccessCodeEmail('dev@clip-studio.test')).toBe(false);
	});
});
