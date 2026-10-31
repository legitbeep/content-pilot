// Docs: docs/timeline.md
// Render status of every clip in this clip's session (polled by the editor), with a presigned
// URL for finished renders.
import { error, json } from '@sveltejs/kit';
import { presignGet } from '$lib/server/r2';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { supabase } }) => {
	const { data: clip } = await supabase
		.from('clips')
		.select('job_id')
		.eq('id', params.clipId)
		.maybeSingle();
	if (!clip) error(404, 'Clip not found.');
	const { data } = await supabase
		.from('clips')
		.select('id, reason, render_status, render_error, render_path')
		.eq('job_id', clip.job_id)
		.eq('selected', true)
		.not('file_key', 'is', null)
		.order('start_s');
	const renders = await Promise.all(
		(data ?? []).map(async (c) => ({
			id: c.id as string,
			reason: c.reason as string,
			status: c.render_status as string | null,
			error: c.render_error as string | null,
			url: c.render_status === 'done' && c.render_path ? await presignGet(c.render_path) : null
		}))
	);
	return json(renders);
};
