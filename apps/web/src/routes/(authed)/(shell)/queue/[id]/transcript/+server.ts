import { error, json } from '@sveltejs/kit';
import type { Transcript } from '$lib/entities/job';
import { getJson } from '$lib/server/r2';
import type { RequestHandler } from './$types';

/** Transcript preview for the details sheet: utterances only (speaker + timecodes). */
export const GET: RequestHandler = async ({ params, locals: { supabase } }) => {
	// RLS: only the owner's job comes back.
	const { data: job } = await supabase
		.from('jobs')
		.select('transcript_path')
		.eq('id', params.id)
		.maybeSingle();
	if (!job) error(404, 'Job not found');
	if (!job.transcript_path) return json({ utterances: [] });
	const t = await getJson<Transcript>(job.transcript_path);
	return json({ utterances: t?.utterances ?? [] });
};
