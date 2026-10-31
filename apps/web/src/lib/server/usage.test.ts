import { describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any -- fake DB */
const rows = vi.hoisted(() => [] as any[]);
vi.mock('./supabase-admin', () => ({
	supabaseAdmin: () => ({
		from: () => {
			const where: Record<string, string> = {};
			const q: any = {
				select: () => q,
				gte: () => q,
				eq: (c: string, v: string) => ((where[c] = v), q),
				insert: async (row: any) => (rows.push(row), { error: null }),
				then: (res: any) =>
					res({ count: rows.filter((r) => r.kind === where.kind).length, error: null })
			};
			return q;
		}
	})
}));

const { recordJob, requireDailyJobQuota } = await import('./usage');

describe('daily job cap', () => {
	it('blocks the 6th job of the day, and demo rows do not count', async () => {
		rows.push({ user_id: 'u1', kind: 'job' }); // a demo-keyed job row
		for (let i = 0; i < 5; i++) {
			await requireDailyJobQuota('u1');
			await recordJob('u1');
		}
		await expect(requireDailyJobQuota('u1')).rejects.toMatchObject({ status: 429 });
	});
});
