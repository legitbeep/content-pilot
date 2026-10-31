import { fail } from '@sveltejs/kit';
import { buildMemoryContext, profileFromRow, type MemoryRule } from '$lib/entities/brand';
import { can, UPLOAD_LIMITS, type Job, type JobAction } from '$lib/entities/job';
import { recordDemoJob, requireAIKeys, requireDemoJobQuota } from '$lib/server/llm';
import { deleteObject, headSize, presignPut } from '$lib/server/r2';
import { recordJob, requireDailyJobQuota } from '$lib/server/usage';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase }, depends }) => {
	depends('app:jobs');
	const jobs = await supabase.from('jobs').select('*');
	if (jobs.error) console.error('jobs', jobs.error);
	return { jobs: sortJobs((jobs.data ?? []) as Job[]) };
};

/** Pending first (queue order), then everything else newest first. */
function sortJobs(jobs: Job[]) {
	const pending = jobs
		.filter((j) => j.status === 'pending')
		.sort((a, b) => a.position - b.position);
	const rest = jobs
		.filter((j) => j.status !== 'pending')
		.sort((a, b) => b.created_at.localeCompare(a.created_at));
	return [...pending, ...rest];
}

type Ctx = Parameters<Actions[string]>[0];

/** Load the user's job (RLS) and check the action is allowed in its current state. */
async function jobFor({ locals: { supabase } }: Ctx, id: unknown, action: JobAction) {
	if (typeof id !== 'string' || !id) return { error: fail(400, { message: 'Missing job.' }) };
	const { data } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
	if (!data) return { error: fail(404, { message: 'Job not found.' }) };
	const job = data as Job;
	if (!can(job.status, action))
		return {
			error: fail(409, { message: `Can't ${action.replace('_', ' ')} a ${job.status} job.` })
		};
	return { job };
}

async function nextPosition({ locals: { supabase } }: Ctx) {
	const { data } = await supabase
		.from('jobs')
		.select('position')
		.order('position', { ascending: false })
		.limit(1)
		.maybeSingle();
	return (data?.position ?? 0) + 1;
}

/** A new job needs an LLM and a transcription key (own or demo) and a free daily slot.
 * 409 missing_key / 429 daily or demo cap, thrown so formAction shows the message. Returns `demo`. */
async function requireUploadKeys(userId: string) {
	const { demo } = await requireAIKeys(userId, 'both');
	await requireDailyJobQuota(userId);
	if (demo) await requireDemoJobQuota(userId);
	return demo;
}

/** Brand memory frozen on the job (scope clip_selection); the worker reads only this text. */
async function memorySnapshot({ locals: { supabase } }: Ctx) {
	const [profile, rules] = await Promise.all([
		supabase.from('brand_profile').select('answers, example_posts').maybeSingle(),
		supabase.from('brand_rules').select('rule, scope, status, evidence_count')
	]);
	if (profile.error || rules.error) console.error('memory snapshot', profile.error ?? rules.error);
	const text = buildMemoryContext(
		profileFromRow(profile.data),
		(rules.data ?? []) as MemoryRule[],
		{
			scope: 'clip_selection'
		}
	);
	return text.trim() || null;
}

const safeName = (name: string) => name.replace(/[^\w.-]+/g, '_').slice(-100) || 'video';

export const actions: Actions = {
	/** Step 1 of upload: check limits + keys, return a presigned PUT URL. No job row yet. */
	presign: async ({ request, locals: { user } }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const type = String(form.get('type') ?? '');
		const size = Number(form.get('size'));
		if (!type.startsWith('video/'))
			return fail(400, { message: 'Only video files can be uploaded.' });
		if (!(size > 0) || size > UPLOAD_LIMITS.maxBytes)
			return fail(400, { message: 'Videos must be 2 GB or smaller.' });

		await requireUploadKeys(user!.id);

		const uploadId = crypto.randomUUID();
		const key = `uploads/${user!.id}/${uploadId}/${safeName(name)}`;
		return { uploadId, key, url: await presignPut(key) };
	},

	/** Step 3 of upload: the browser finished the PUT; create the job at the end of the queue. */
	create: async (ctx) => {
		const { request, locals } = ctx;
		const form = await request.formData();
		const key = String(form.get('key') ?? '');
		const demo = await requireUploadKeys(locals.user!.id);
		if (!key.startsWith(`uploads/${locals.user!.id}/`))
			return fail(400, { message: 'Upload not found.' });
		const size = await headSize(key);
		if (size === null) return fail(400, { message: 'Upload not found. Try uploading again.' });
		if (size > UPLOAD_LIMITS.maxBytes) {
			await deleteObject(key);
			return fail(400, { message: 'Videos must be 2 GB or smaller.' });
		}
		const duration = Number(form.get('duration'));
		if (duration > UPLOAD_LIMITS.maxSeconds) {
			await deleteObject(key);
			return fail(400, { message: 'Videos must be 60 minutes or shorter.' });
		}
		const requestText = String(form.get('request') ?? '')
			.trim()
			.slice(0, 2000);

		const { error } = await locals.supabase.from('jobs').insert({
			user_id: locals.user!.id,
			source_key: key,
			title: String(form.get('title') ?? '').slice(0, 200) || null,
			request: requestText || null,
			duration_s: duration > 0 ? duration : null,
			position: await nextPosition(ctx),
			memory_snapshot: await memorySnapshot(ctx)
		});
		if (error) {
			console.error('jobs insert', error);
			return fail(500, { message: 'Could not create the job.' });
		}
		await recordJob(locals.user!.id);
		if (demo) await recordDemoJob(locals.user!.id);
		return { created: true };
	},

	/** Body: ids = pending job ids in their new order. */
	reorder: async ({ request, locals: { supabase } }) => {
		const ids = (await request.formData()).getAll('ids').map(String);
		const { data } = await supabase.from('jobs').select('id, status').in('id', ids);
		if (!data || data.length !== ids.length || data.some((j) => !can(j.status, 'reorder')))
			return fail(409, { message: 'Only pending jobs can be reordered.' });
		// ponytail: one update per row; fine for a personal queue, use an RPC if queues get long.
		const results = await Promise.all(
			ids.map((id, i) =>
				supabase
					.from('jobs')
					.update({ position: i + 1 })
					.eq('id', id)
					.eq('status', 'pending')
			)
		);
		if (results.some((r) => r.error)) return fail(500, { message: 'Could not reorder.' });
	},

	editRequest: async (ctx) => {
		const form = await ctx.request.formData();
		const { job, error } = await jobFor(ctx, form.get('id'), 'edit_request');
		if (error) return error;
		const text = String(form.get('request') ?? '')
			.trim()
			.slice(0, 2000);
		await ctx.locals.supabase
			.from('jobs')
			.update({ request: text || null })
			.eq('id', job.id)
			.eq('status', 'pending');
	},

	delete: async (ctx) => {
		const { job, error } = await jobFor(ctx, (await ctx.request.formData()).get('id'), 'delete');
		if (error) return error;
		const { error: err } = await ctx.locals.supabase
			.from('jobs')
			.delete()
			.eq('id', job.id)
			.eq('status', job.status);
		if (err) return fail(500, { message: 'Could not delete the job.' });
		// Best effort: a leftover object costs storage, not correctness.
		await Promise.all(
			[job.source_key, job.transcript_path, `transcripts/${job.id}.deepgram.json`]
				.filter((k): k is string => !!k)
				.map((k) => deleteObject(k).catch((e) => console.error('R2 delete', k, e)))
		);
	},

	/** The worker sees stop_requested before the next step and moves the job to stopped. */
	stop: async (ctx) => {
		const { job, error } = await jobFor(ctx, (await ctx.request.formData()).get('id'), 'stop');
		if (error) return error;
		await ctx.locals.supabase
			.from('jobs')
			.update({ stop_requested: true })
			.eq('id', job.id)
			.eq('status', 'processing');
	},

	requeue: (ctx) => backToPending(ctx, 'requeue'),
	retry: (ctx) => backToPending(ctx, 'retry'),

	answer: async (ctx) => {
		const form = await ctx.request.formData();
		const { job, error } = await jobFor(ctx, form.get('id'), 'answer');
		if (error) return error;
		await requireAIKeys(ctx.locals.user!.id, 'both');
		const answer = String(form.get('answer') ?? '').trim();
		if (!answer) return fail(400, { message: 'Write an answer first.' });
		await ctx.locals.supabase
			.from('jobs')
			.update({
				status: 'pending',
				input_request: { ...job.input_request, answer },
				// Job-scoped intent for extraction, never a brand rule.
				...(job.input_request?.kind === 'brand_fit' ? { user_intent: answer.slice(0, 2000) } : {}),
				position: await nextPosition(ctx)
			})
			.eq('id', job.id)
			.eq('status', 'needs_input');
	}
};

/** failed/stopped → pending at the end of the queue, resuming from the step it stopped at. */
async function backToPending(ctx: Ctx, action: 'requeue' | 'retry') {
	const { job, error } = await jobFor(ctx, (await ctx.request.formData()).get('id'), action);
	if (error) return error;
	await requireAIKeys(ctx.locals.user!.id, 'both'); // re-runs AI steps
	await ctx.locals.supabase
		.from('jobs')
		.update({
			status: 'pending',
			resume_from_step: job.current_step,
			stop_requested: false,
			error: null,
			error_detail: null,
			position: await nextPosition(ctx)
		})
		.eq('id', job.id)
		.eq('status', job.status);
}
