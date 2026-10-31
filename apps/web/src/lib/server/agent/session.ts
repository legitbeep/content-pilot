// Docs: docs/agent.md
// What the agent may see for one editing session: the open clip, the session's selected clips,
// the user's uploaded audio/video keys and the editing brand memory. RLS client (own rows only).
import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMemoryContext, type BrandRule } from '$lib/entities/brand';
import type { EditorClip } from '$lib/entities/timeline';
import { loadBrand } from '../brand';
import { listKeys } from '../r2';

const CLIP_COLS =
	'id, job_id, reason, start_s, end_s, file_key, file_start_s, file_end_s, words, render_status, render_error';
const MEDIA = /\.(m4a|mp3|wav|aac|ogg|webm|mp4|mov)$/i;

export async function loadSession(supabase: SupabaseClient, userId: string, clipId: string) {
	const { data: clip } = await supabase
		.from('clips')
		.select(CLIP_COLS)
		.eq('id', clipId)
		.maybeSingle();
	if (!clip) error(404, 'Clip not found.');
	const [{ data: clips }, brand, rules, uploads] = await Promise.all([
		supabase
			.from('clips')
			.select(CLIP_COLS)
			.eq('job_id', clip.job_id)
			.eq('selected', true)
			.not('file_key', 'is', null)
			.order('start_s'),
		loadBrand(supabase, userId),
		supabase.from('brand_rules').select('rule, scope, status, evidence_count'),
		listKeys(`uploads/${userId}/`).catch((e) => {
			console.error('agent: listing uploads failed', e);
			return [] as string[];
		})
	]);
	const list = (clips ?? []) as EditorClip[];
	if (!list.some((c) => c.id === clipId)) list.unshift(clip as EditorClip);
	return {
		clip: clip as EditorClip,
		clips: list,
		uploads: uploads.filter((k) => MEDIA.test(k)).slice(-30),
		memory: buildMemoryContext(brand.profile, (rules.data ?? []) as BrandRule[], {
			scope: 'editing'
		})
	};
}
