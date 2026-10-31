// Docs: docs/queue.md
// Per-user usage caps for new jobs (UPLOAD_LIMITS.jobsPerDay). Counts the append-only demo_usage
// log (kind 'upload', one row per created job, any key source), so deleting a job never frees a
// slot. The other caps live elsewhere: 60 min in the worker's probe, 2 processing in its claim query.
import { error } from '@sveltejs/kit';
import { UPLOAD_LIMITS } from '$lib/entities/job';
import { supabaseAdmin } from './supabase-admin';

export const DAILY_CAP_MESSAGE = `You can add ${UPLOAD_LIMITS.jobsPerDay} videos a day. Try again tomorrow (the count resets at 00:00 UTC).`;

/** 429 once the user created UPLOAD_LIMITS.jobsPerDay jobs this UTC day. */
export async function requireDailyJobQuota(userId: string): Promise<void> {
	const since = new Date();
	since.setUTCHours(0, 0, 0, 0);
	const { count, error: err } = await supabaseAdmin()
		.from('demo_usage')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId)
		.eq('kind', 'upload')
		.gte('created_at', since.toISOString());
	if (err) throw new Error(`usage count failed: ${err.message}`);
	if ((count ?? 0) >= UPLOAD_LIMITS.jobsPerDay) error(429, DAILY_CAP_MESSAGE);
}

/** One row per created job (counted by requireDailyJobQuota). */
export async function recordJob(userId: string): Promise<void> {
	const { error: err } = await supabaseAdmin()
		.from('demo_usage')
		.insert({ user_id: userId, kind: 'upload' });
	if (err) console.error('usage insert failed', err.message); // the job exists; don't fail it
}
