import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/llm', () => ({ isDemoUser: () => false }));

const { load } = await import('./+layout.server');

const run = (completed: string | null) => {
	const supabase = {
		from: (table: string) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const q: any = {
				select: () => (table === 'brand_profile' ? q : Promise.resolve({ data: [] })),
				eq: () => q,
				maybeSingle: async () => ({ data: { onboarding_completed_at: completed }, error: null })
			};
			return q;
		}
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return load({ locals: { supabase, user: { id: 'u1' } }, cookies: { get: () => undefined } } as any);
};

describe('shell onboarding gate', () => {
	it('redirects to onboarding until onboarding is completed', async () => {
		await expect(run(null)).rejects.toMatchObject({ status: 303, location: '/onboarding' });
	});
	it('lets a completed user through', async () => {
		await expect(run('2026-11-01T00:00:00Z')).resolves.toMatchObject({ sidebarOpen: true });
	});
});
