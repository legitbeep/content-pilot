import { describe, expect, it } from 'vitest';
import { dayKey, filterPosts, monthGrid, shiftMonth, type CalendarPost } from './calendar';

const p = (over: Partial<CalendarPost>): CalendarPost => ({
	id: 'x',
	platform: 'youtube',
	status: 'scheduled',
	scheduled_at: null,
	posted_at: null,
	...over
});

describe('calendar helpers', () => {
	it('builds a Monday-first month grid', () => {
		const g = monthGrid('2026-11'); // Nov 1 2026 is a Sunday
		expect(g.slice(0, 6).every((d) => d === null)).toBe(true);
		expect(g[6] && dayKey(g[6])).toBe('2026-11-01');
		expect(g.filter(Boolean)).toHaveLength(30);
	});
	it('shifts months across years', () => {
		expect(shiftMonth('2026-12', 1)).toBe('2027-01');
		expect(shiftMonth('2026-01', -1)).toBe('2025-12');
	});
	it('filters by platform, status and inclusive local date range', () => {
		const local = (d: string) => new Date(`${d}T12:00:00`).toISOString();
		const posts = [
			p({ id: 'a', scheduled_at: local('2026-11-02') }),
			p({ id: 'b', status: 'posted', posted_at: local('2026-11-05') }),
			p({ id: 'c', platform: 'x', scheduled_at: local('2026-11-09') })
		];
		const ids = (f: Partial<Parameters<typeof filterPosts>[1]>) =>
			filterPosts(posts, { platform: '', status: '', from: '', to: '', ...f }).map((x) => x.id);
		expect(ids({})).toEqual(['a', 'b', 'c']);
		expect(ids({ status: 'posted' })).toEqual(['b']);
		expect(ids({ platform: 'youtube' })).toEqual(['a', 'b']);
		expect(ids({ from: '2026-11-05', to: '2026-11-09' })).toEqual(['b', 'c']);
	});
});
