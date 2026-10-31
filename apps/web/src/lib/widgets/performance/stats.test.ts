import { describe, expect, it } from 'vitest';
import { homeStats, latestMetrics, ratingNudges, weekStart, type HomeMetric } from './stats';

const now = new Date('2026-11-01T12:00:00Z'); // a Sunday
const posts = [
	{ id: 'a', title: 'A', posted_at: '2026-10-27T10:00:00Z', external_url: null },
	{ id: 'b', title: 'B', posted_at: '2026-10-20T10:00:00Z', external_url: null },
	{ id: 'old', title: 'Old', posted_at: '2025-01-01T10:00:00Z', external_url: null }
];
const m = (
	post_id: string,
	checkpoint: HomeMetric['checkpoint'],
	views: number,
	score: number | null
): HomeMetric => ({
	post_id,
	checkpoint,
	views,
	score,
	rating: null
});
const metrics = [
	m('a', '48h', 100, null),
	m('b', '7d', 500, 2.0),
	m('b', '48h', 50, 0.5),
	m('old', '30d', 9, 0.2)
];

describe('home stats', () => {
	it('weeks start on Monday (UTC)', () => {
		expect(weekStart(now).toISOString()).toBe('2026-10-26T00:00:00.000Z');
	});
	it('uses each post latest checkpoint', () => {
		expect(latestMetrics(metrics).get('b')?.checkpoint).toBe('7d');
	});
	it('buckets the last 12 weeks, top clips and score distribution', () => {
		const s = homeStats(posts, metrics, now);
		expect(s.postsByWeek).toHaveLength(12);
		expect(s.postsByWeek.at(-1)?.value).toBe(1);
		expect(s.viewsByWeek.at(-2)?.value).toBe(500);
		expect(s.top.map((t) => t.id)).toEqual(['b', 'a', 'old']);
		expect(s.scoreDist.map((b) => b.value)).toEqual([1, 0, 0, 1, 0]);
		expect(s.notEnoughData).toBe(1);
	});
	it('nudges surprising unrated 7d scores', () => {
		expect(ratingNudges(posts, metrics).map((n) => n.post.id)).toEqual(['b']);
	});
});
