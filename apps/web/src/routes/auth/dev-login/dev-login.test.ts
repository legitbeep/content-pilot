import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ dev: true, env: {} as Record<string, string> }));
vi.mock('$app/environment', () => ({
	get dev() {
		return state.dev;
	}
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
const writes = vi.hoisted(
	() => [] as { table: string; op: string; row: unknown; opts?: unknown }[]
);
vi.mock('$lib/server/supabase-admin', () => ({
	supabaseAdmin: () => ({
		auth: { admin: { createUser: async () => ({ error: { code: 'email_exists' } }) } },
		from: (table: string) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const q: any = {
				upsert: async (row: unknown, opts: unknown) => (
					writes.push({ table, op: 'upsert', row, opts }),
					{ error: null }
				),
				update: (row: unknown) => (writes.push({ table, op: 'update', row }), q),
				eq: () => q,
				is: async () => ({ error: null })
			};
			return q;
		}
	})
}));

const { GET, POST } = await import('./+server');
const { devLogin, devLoginEnabled } = await import('$lib/server/dev-login');
const supabase = {
	auth: { signInWithPassword: async () => ({ data: { user: { id: 'dev-user' } }, error: null }) }
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (h: typeof GET) => h({ url: new URL('http://x/auth/dev-login'), locals: {} } as any);

describe('dev login', () => {
	beforeEach(() => {
		state.dev = true;
		state.env.DEV_LOGIN = 'true';
		writes.length = 0;
	});

	it('marks the test user onboarded without overwriting an existing profile', async () => {
		expect(await devLogin(supabase)).toBeNull();
		expect(writes[0]).toMatchObject({
			table: 'brand_profile',
			op: 'upsert',
			row: { user_id: 'dev-user' },
			opts: { onConflict: 'user_id', ignoreDuplicates: true }
		});
		expect(writes[1]).toMatchObject({
			table: 'brand_profile',
			op: 'update',
			row: { onboarding_completed_at: expect.any(String) }
		});
		expect(writes[2]).toMatchObject({ table: 'profiles', op: 'update' });
	});

	it('is enabled only in dev with DEV_LOGIN=true', () => {
		expect(devLoginEnabled()).toBe(true);
	});

	it('404s when DEV_LOGIN is off', async () => {
		delete state.env.DEV_LOGIN;
		expect(devLoginEnabled()).toBe(false);
		await expect(call(GET)).rejects.toMatchObject({ status: 404 });
		await expect(call(POST)).rejects.toMatchObject({ status: 404 });
		expect(await devLogin(supabase)).toBe('Dev login is disabled.');
		expect(writes).toEqual([]); // no user or onboarding writes when the flag is off
	});

	it('404s outside dev even with DEV_LOGIN=true', async () => {
		state.dev = false;
		expect(devLoginEnabled()).toBe(false);
		await expect(call(GET)).rejects.toMatchObject({ status: 404 });
		await expect(call(POST)).rejects.toMatchObject({ status: 404 });
		expect(await devLogin(supabase)).toBe('Dev login is disabled.');
		expect(writes).toEqual([]);
	});
});
