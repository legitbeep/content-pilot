import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ dev: true, env: {} as Record<string, string> }));
vi.mock('$app/environment', () => ({
	get dev() {
		return state.dev;
	}
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { GET, POST } = await import('./+server');
const { devLoginEnabled } = await import('$lib/server/dev-login');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (h: typeof GET) => h({ url: new URL('http://x/auth/dev-login'), locals: {} } as any);

describe('dev login', () => {
	beforeEach(() => {
		state.dev = true;
		state.env.DEV_LOGIN = 'true';
	});

	it('is enabled only in dev with DEV_LOGIN=true', () => {
		expect(devLoginEnabled()).toBe(true);
	});

	it('404s when DEV_LOGIN is off', async () => {
		delete state.env.DEV_LOGIN;
		expect(devLoginEnabled()).toBe(false);
		await expect(call(GET)).rejects.toMatchObject({ status: 404 });
		await expect(call(POST)).rejects.toMatchObject({ status: 404 });
	});

	it('404s outside dev even with DEV_LOGIN=true', async () => {
		state.dev = false;
		expect(devLoginEnabled()).toBe(false);
		await expect(call(GET)).rejects.toMatchObject({ status: 404 });
		await expect(call(POST)).rejects.toMatchObject({ status: 404 });
	});
});
