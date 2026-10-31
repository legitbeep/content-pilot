// Home dashboard numbers from posts + post_metrics (pure, tested in stats.test.ts).
export type HomePost = {
	id: string;
	title: string | null;
	posted_at: string;
	external_url: string | null;
};
export type HomeMetric = {
	post_id: string;
	checkpoint: '48h' | '7d' | '14d' | '30d';
	views: number;
	score: number | null;
	rating: number | null;
};
export type Bar = { label: string; value: number };

const ORDER = ['48h', '7d', '14d', '30d'];
const WEEKS = 12;
const DAY = 864e5;

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStart(d: Date): Date {
	const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY);
}
const label = (d: Date) =>
	d.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Each post's latest checkpoint metric. */
export function latestMetrics(metrics: HomeMetric[]): Map<string, HomeMetric> {
	const out = new Map<string, HomeMetric>();
	for (const m of metrics) {
		const cur = out.get(m.post_id);
		if (!cur || ORDER.indexOf(m.checkpoint) > ORDER.indexOf(cur.checkpoint)) out.set(m.post_id, m);
	}
	return out;
}

export function homeStats(posts: HomePost[], metrics: HomeMetric[], now = new Date()) {
	const latest = latestMetrics(metrics);
	const first = weekStart(new Date(now.getTime() - (WEEKS - 1) * 7 * DAY)).getTime();
	const weeks = Array.from({ length: WEEKS }, (_, i) => new Date(first + i * 7 * DAY));
	const viewsByWeek = weeks.map((w) => ({ label: label(w), value: 0 }));
	const postsByWeek = weeks.map((w) => ({ label: label(w), value: 0 }));
	for (const p of posts) {
		const i = Math.floor((weekStart(new Date(p.posted_at)).getTime() - first) / (7 * DAY));
		if (i < 0 || i >= WEEKS) continue;
		postsByWeek[i].value += 1;
		viewsByWeek[i].value += latest.get(p.id)?.views ?? 0;
	}
	const top = posts
		.filter((p) => latest.has(p.id))
		.map((p) => ({ ...p, views: latest.get(p.id)!.views, score: latest.get(p.id)!.score }))
		.sort((a, b) => b.views - a.views)
		.slice(0, 5);
	const buckets: [string, (s: number) => boolean][] = [
		['< 0.6x', (s) => s < 0.6],
		['0.6-1x', (s) => s >= 0.6 && s < 1],
		['1-1.5x', (s) => s >= 1 && s <= 1.5],
		['1.5-3x', (s) => s > 1.5 && s <= 3],
		['> 3x', (s) => s > 3]
	];
	const scores = [...latest.values()].map((m) => m.score);
	const scoreDist: Bar[] = buckets.map(([l, f]) => ({
		label: l,
		value: scores.filter((s): s is number => s !== null && f(s)).length
	}));
	return {
		viewsByWeek,
		postsByWeek,
		top,
		scoreDist,
		notEnoughData: scores.filter((s) => s === null).length
	};
}

/** Posts whose 7d score surprised (boost/downgrade range) and aren't rated yet. */
export function ratingNudges(posts: HomePost[], metrics: HomeMetric[]) {
	return metrics
		.filter((m) => m.checkpoint === '7d' && m.score !== null && m.rating === null)
		.filter((m) => m.score! > 1.5 || m.score! < 0.6)
		.map((m) => ({ post: posts.find((p) => p.id === m.post_id), score: m.score! }))
		.filter((n): n is { post: HomePost; score: number } => !!n.post)
		.slice(0, 2);
}
