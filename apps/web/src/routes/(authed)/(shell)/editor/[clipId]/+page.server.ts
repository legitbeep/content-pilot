// Docs: docs/timeline.md
import { error, fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
	newTimeline,
	Timeline,
	timelineKeys,
	type EditorClip,
	type TimelineRow
} from '$lib/entities/timeline';
import { UPLOAD_LIMITS } from '$lib/entities/job';
import { presignGet, presignPut } from '$lib/server/r2';
import type { Actions, PageServerLoad } from './$types';

const CLIP_COLS =
	'id, job_id, reason, start_s, end_s, file_key, file_start_s, file_end_s, words, render_status, render_error';

type ClipRow = EditorClip;

/** The clip's timeline, created from the clip's range on first open. */
async function ensureTimeline(supabase: SupabaseClient, userId: string, clip: ClipRow) {
	const { data } = await supabase
		.from('timelines')
		.select('clip_id, data, revision, rendered_revision')
		.eq('clip_id', clip.id)
		.maybeSingle();
	if (data) return data as TimelineRow & { rendered_revision: number | null };
	if (!clip.file_key) return null;
	const offset = clip.file_start_s ?? clip.start_s;
	const row = {
		user_id: userId,
		clip_id: clip.id,
		data: newTimeline(clip.file_key, clip.start_s - offset, clip.end_s - offset),
		revision: 1
	};
	// ignoreDuplicates: a parallel first open already created it.
	await supabase.from('timelines').upsert(row, { onConflict: 'clip_id', ignoreDuplicates: true });
	return row as TimelineRow;
}

/** The clip plus every selected clip of the same session that still has its file. */
async function session(supabase: SupabaseClient, clipId: string) {
	const { data: clip } = await supabase
		.from('clips')
		.select(CLIP_COLS)
		.eq('id', clipId)
		.maybeSingle();
	if (!clip) error(404, 'Clip not found.');
	const { data: clips } = await supabase
		.from('clips')
		.select(CLIP_COLS)
		.eq('job_id', clip.job_id)
		.eq('selected', true)
		.not('file_key', 'is', null)
		.order('start_s');
	const list = (clips ?? []) as ClipRow[];
	if (!list.some((c) => c.id === clipId)) list.unshift(clip as ClipRow);
	return { clip: clip as ClipRow, clips: list };
}

/** Keys the user may not use: anything that isn't their own upload or one of their clip files. */
async function foreignKeys(supabase: SupabaseClient, userId: string, keys: string[]) {
	const others = keys.filter((k) => !k.startsWith(`uploads/${userId}/`));
	if (!others.length) return [];
	const { data } = await supabase.from('clips').select('file_key').in('file_key', others); // RLS
	const own = new Set((data ?? []).map((r) => r.file_key));
	return others.filter((k) => !own.has(k));
}

export const load: PageServerLoad = async ({ params, locals: { supabase, user } }) => {
	const { clip, clips } = await session(supabase, params.clipId);
	const [timeline, { data: job }] = await Promise.all([
		ensureTimeline(supabase, user!.id, clip),
		supabase.from('jobs').select('title').eq('id', clip.job_id).maybeSingle()
	]);
	const keys = new Set(clips.map((c) => c.file_key!).filter(Boolean));
	for (const k of timeline ? timelineKeys(timeline.data) : []) keys.add(k);
	const urls = Object.fromEntries(
		await Promise.all([...keys].map(async (k) => [k, await presignGet(k)] as const))
	);
	return { clip, clips, timeline, urls, sourceName: job?.title ?? 'original audio' };
};

const Events = z
	.array(
		z.strictObject({
			op: z.string().min(1).max(40),
			args: z.unknown(),
			summary: z.string().min(1).max(300),
			source: z.enum(['manual', 'agent'])
		})
	)
	.max(500);

const json = (v: FormDataEntryValue | null) => {
	try {
		return JSON.parse(String(v ?? ''));
	} catch {
		return undefined;
	}
};

const safeName = (name: string) => name.replace(/[^\w.-]+/g, '_').slice(-100) || 'file';

export const actions: Actions = {
	/** Autosave: compare-and-set on `revision`, append edit events, optionally queue a render. */
	save: async ({ params, request, locals: { supabase, user } }) => {
		const form = await request.formData();
		const revision = Number(form.get('revision'));
		const timeline = Timeline.safeParse(json(form.get('timeline')));
		const events = Events.safeParse(json(form.get('events')) ?? []);
		if (!timeline.success || !events.success || !Number.isInteger(revision))
			return fail(400, { message: 'That edit could not be saved (invalid timeline).' });
		const bad = await foreignKeys(supabase, user!.id, timelineKeys(timeline.data));
		if (bad.length) return fail(400, { message: 'The timeline uses a file you do not own.' });

		const { data: saved, error: err } = await supabase
			.from('timelines')
			.update({ data: timeline.data, revision: revision + 1, updated_at: new Date().toISOString() })
			.eq('clip_id', params.clipId)
			.eq('revision', revision)
			.select('revision')
			.maybeSingle();
		if (err) return fail(500, { message: 'Could not save.' });
		if (!saved)
			return fail(409, { message: 'This clip was changed somewhere else. Reload to continue.' });

		if (events.data.length) {
			const rows = events.data.map((e) => ({ ...e, user_id: user!.id, clip_id: params.clipId }));
			const { error: evErr } = await supabase.from('edit_events').insert(rows);
			if (evErr) console.error('edit_events insert', evErr); // the edit itself is saved
		}
		if (form.get('render') === '1') await queueRenders(supabase, [params.clipId]);
		return { revision: saved.revision as number };
	},

	/** "Finish all clips": queue each session clip whose render is missing or older than its
	 * timeline (timelines created if never opened). Queued/rendering/up-to-date clips are skipped. */
	renderAll: async ({ params, locals: { supabase, user } }) => {
		const { clips } = await session(supabase, params.clipId);
		const stale = await Promise.all(
			clips.map(async (c) => {
				const t = await ensureTimeline(supabase, user!.id, c);
				if (c.render_status === 'queued' || c.render_status === 'rendering') return null;
				const rendered = t && 'rendered_revision' in t ? t.rendered_revision : null;
				return c.render_status === 'done' && rendered === t?.revision ? null : c.id;
			})
		);
		const ids = stale.filter((id) => id !== null);
		if (ids.length) await queueRenders(supabase, ids);
		return { queued: ids };
	},

	/** Presigned PUT (+ GET for the preview) for a voiceover, music track or extra video. */
	presignUpload: async ({ request, locals: { user } }) => {
		const form = await request.formData();
		const type = String(form.get('type') ?? '');
		const size = Number(form.get('size'));
		if (!type.startsWith('audio/') && !type.startsWith('video/'))
			return fail(400, { message: 'Only audio or video files can be added.' });
		if (!(size > 0) || size > UPLOAD_LIMITS.maxBytes)
			return fail(400, { message: 'Files must be 2 GB or smaller.' });
		const key = `uploads/${user!.id}/${crypto.randomUUID()}/${safeName(String(form.get('name') ?? ''))}`;
		return { key, putUrl: await presignPut(key), getUrl: await presignGet(key) };
	}
};

async function queueRenders(supabase: SupabaseClient, ids: string[]) {
	const { error: err } = await supabase
		.from('clips')
		.update({
			render_status: 'queued',
			render_requested_at: new Date().toISOString(),
			render_error: null
		})
		.in('id', ids)
		.not('file_key', 'is', null);
	if (err) error(500, 'Could not queue the render.');
}
