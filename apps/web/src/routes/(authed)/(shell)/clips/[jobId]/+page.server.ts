// Docs: docs/pipeline.md
// Clip Picker: candidates of one finished job, approve/reject feedback, "Proceed with editing".
import { error, fail } from '@sveltejs/kit';
import { REJECT_REASONS, type ClipCandidate } from '$lib/entities/clip';
import { presignGet } from '$lib/server/r2';
import type { Actions, PageServerLoad } from './$types';

const COLS =
	'id, start_s, end_s, hook, reason, reasons, description, scores, ranking_score, words, file_start_s, file_key, thumb_key, selected';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const { data: job } = await supabase
		.from('jobs')
		.select('id, title, status, request, user_intent, proceeded_at, source_deleted_at')
		.eq('id', params.jobId)
		.maybeSingle();
	if (!job) error(404, 'Job not found.');
	const [clips, feedback] = await Promise.all([
		supabase
			.from('clips')
			.select(COLS)
			.eq('job_id', job.id)
			.order('ranking_score', { ascending: false, nullsFirst: false }),
		supabase
			.from('clip_feedback')
			.select('clip_id, decision, reason')
			.eq('job_id', job.id)
			.order('created_at')
	]);
	if (clips.error) console.error('clips load', clips.error);
	const rows = (clips.data ?? []) as ClipCandidate[];
	// Latest decision per clip (rows are append-only, oldest first).
	const decisions: Record<string, { decision: string; reason: string | null }> = {};
	for (const f of feedback.data ?? []) decisions[f.clip_id] = f;
	const urls: Record<string, { video?: string; thumb?: string }> = {};
	await Promise.all(
		rows.map(async (c) => {
			urls[c.id] = {
				video: c.file_key ? await presignGet(c.file_key) : undefined,
				thumb: c.thumb_key ? await presignGet(c.thumb_key) : undefined
			};
		})
	);
	return { job, clips: rows, decisions, urls };
};

type Ctx = Parameters<Actions[string]>[0];

async function jobClips({ params, locals: { supabase } }: Ctx) {
	const { data: job } = await supabase
		.from('jobs')
		.select('id, status')
		.eq('id', params.jobId!)
		.maybeSingle();
	if (!job || job.status !== 'done') return null;
	const { data } = await supabase.from('clips').select('id, file_key').eq('job_id', job.id);
	return { job, clips: data ?? [] };
}

export const actions: Actions = {
	/** Append one approve/reject to clip_feedback (plan 7 learns from these). */
	feedback: async (ctx) => {
		const form = await ctx.request.formData();
		const clipId = String(form.get('clipId') ?? '');
		const decision = String(form.get('decision') ?? '');
		const reason = String(form.get('reason') ?? '').trim();
		if (decision !== 'approved' && decision !== 'rejected')
			return fail(400, { message: 'Unknown decision.' });
		if (reason && !(REJECT_REASONS as readonly string[]).includes(reason))
			return fail(400, { message: 'Unknown reason.' });
		const found = await jobClips(ctx);
		if (!found?.clips.some((c) => c.id === clipId))
			return fail(404, { message: 'Clip not found.' });
		const { error: err } = await ctx.locals.supabase.from('clip_feedback').insert({
			user_id: ctx.locals.user!.id,
			clip_id: clipId,
			job_id: found.job.id,
			decision,
			reason: decision === 'rejected' ? reason || null : null
		});
		if (err) {
			console.error('clip_feedback insert', err);
			return fail(500, { message: 'Could not save that.' });
		}
	},

	/** Mark the selected clips, start cleanup (worker deletes the source + unselected files),
	 * return the first clip for the editor. */
	proceed: async (ctx) => {
		const ids = (await ctx.request.formData()).getAll('ids').map(String);
		const found = await jobClips(ctx);
		if (!found) return fail(409, { message: 'Only finished jobs can be edited.' });
		const usable = new Set(found.clips.filter((c) => c.file_key).map((c) => c.id));
		if (!ids.length || !ids.every((id) => usable.has(id)))
			return fail(400, { message: 'Select at least one clip.' });
		const { supabase } = ctx.locals;
		const all = found.clips.map((c) => c.id);
		const results = await Promise.all([
			supabase.from('clips').update({ selected: true }).in('id', ids),
			supabase
				.from('clips')
				.update({ selected: false })
				.in(
					'id',
					all.filter((id) => !ids.includes(id))
				),
			supabase
				.from('jobs')
				.update({ proceeded_at: new Date().toISOString() })
				.eq('id', found.job.id)
				.is('proceeded_at', null)
		]);
		if (results.some((r) => r.error)) {
			console.error('proceed', results.map((r) => r.error).filter(Boolean));
			return fail(500, { message: 'Could not save your selection.' });
		}
		return { clipId: ids[0] };
	}
};
