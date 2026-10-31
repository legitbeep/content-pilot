// Docs: docs/publishing.md
// Pure helpers for the calendar: all dates in the browser's time zone (the page is ssr = false).
import type { Platform, PostStatus } from '$lib/entities/post';

export type CalendarPost = {
	id: string;
	platform: Platform;
	status: PostStatus;
	scheduled_at: string | null;
	posted_at: string | null;
};
export type Filters = { platform: string; status: string; from: string; to: string };

/** The time a post lives at on the calendar: when it went out, else when it's due. */
export const postTime = (p: CalendarPost) => new Date(p.posted_at ?? p.scheduled_at ?? 0);

/** Local `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Filters from the URL; empty string = any. `from`/`to` are inclusive local days. */
export function filterPosts<T extends CalendarPost>(posts: T[], f: Filters): T[] {
	return posts.filter((p) => {
		const day = dayKey(postTime(p));
		return (
			(!f.platform || p.platform === f.platform) &&
			(!f.status || p.status === f.status) &&
			(!f.from || day >= f.from) &&
			(!f.to || day <= f.to)
		);
	});
}

/** Monday-first grid for `YYYY-MM`: leading nulls, then each day's Date. */
export function monthGrid(month: string): (Date | null)[] {
	const [y, m] = month.split('-').map(Number);
	const first = new Date(y, m - 1, 1);
	const days = new Date(y, m, 0).getDate();
	const lead = (first.getDay() + 6) % 7;
	return [
		...Array<null>(lead).fill(null),
		...Array.from({ length: days }, (_, i) => new Date(y, m - 1, i + 1))
	];
}

/** `YYYY-MM` shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
	const [y, m] = month.split('-').map(Number);
	return dayKey(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}
