// TEMP(onboarding-bypass): remove when plan 4 onboarding is fully tested (plan10)
import { describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({}) as Record<string, string>);
vi.mock('$env/dynamic/private', () => ({ env }));
vi.mock('$lib/server/llm', () => ({ isDemoUser: () => false }));

const { load } = await import('./+layout.server');

const supabase = {
	from: (table: string) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const q: any = {
			select: () => (table === 'brand_profile' ? q : Promise.resolve({ data: [] })),
			eq: () => q,
			maybeSingle: async () => ({ data: { onboarding_completed_at: null }, error: null })
		};
		return q;
	}
};
const run = () =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	load({ locals: { supabase, user: { id: 'u1' } }, cookies: { get: () => undefined } } as any);

describe('shell onboarding gate', () => {
	it('redirects to onboarding when SKIP_ONBOARDING is unset', async () => {
		delete env.SKIP_ONBOARDING;
		await expect(run()).rejects.toMatchObject({ status: 303, location: '/onboarding' });
	});
	it('lets the user through when SKIP_ONBOARDING=true', async () => {
		env.SKIP_ONBOARDING = 'true';
		await expect(run()).resolves.toMatchObject({ sidebarOpen: true });
	});
});
