// Docs: docs/performance.md
// LLM captions (task `captions`): one call writes copy for every platform, steered by brand
// memory (scope copy). Caption edits are logged as edit_events op `caption_edit` (plan 7 learns).
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMemoryContext, type MemoryRule } from '$lib/entities/brand';
import type { Platform } from '$lib/entities/post';
import { generateJSON } from '../llm';
import { loadBrand } from '../brand';
import type { Caption } from './captions';

export const LLMCaptions = z.object({
	youtube: z.object({ title: z.string(), description: z.string(), tags: z.array(z.string()) }),
	instagram: z.object({ caption: z.string(), hashtags: z.array(z.string()) }),
	linkedin: z.object({ text: z.string() }),
	x: z.object({ text: z.string() })
});
export type LLMCaptions = z.infer<typeof LLMCaptions>;

export const CAPTIONS_SYSTEM = `You write social copy for one short video clip, for each platform, in the creator's voice.
Follow the brand memory exactly: language, tone, banned words (never use them), CTA and hashtags. Learn style from the example posts; avoid what the disliked posts do. Don't invent facts beyond the clip.
- youtube: title (max 100 characters, a hook, no clickbait), description (2-4 short lines + CTA), tags (3-10 plain words or phrases, no #).
- instagram: caption (hook line, 2-4 short lines, CTA), hashtags (3-8, with #).
- linkedin: text (professional, insight first, 3-6 short lines, at most 3 hashtags at the end).
- x: text (one punchy post, max 280 characters including hashtags).
Each platform's copy must read differently; don't paste the same text everywhere.`;

const clean = (s: string) => s.replace(/[<>]/g, '').trim();
const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
const hashtag = (h: string) => '#' + h.replace(/^#+/, '').replace(/\s+/g, '');

/** LLM output → the per-platform Caption shape the publish form uses, with hard limits applied. */
export function toCaptions(c: LLMCaptions): Record<Platform, Caption> {
	const tags = c.youtube.tags.map((t) => clean(t).replace(/^#/, '')).filter(Boolean);
	const title = cut(clean(c.youtube.title), 100);
	const ig = [clean(c.instagram.caption), c.instagram.hashtags.map(hashtag).join(' ')]
		.filter(Boolean)
		.join('\n\n');
	return {
		youtube: { title, description: cut(clean(c.youtube.description), 5000), tags },
		instagram: { title, description: cut(ig, 2200), tags },
		linkedin: { title, description: cut(clean(c.linkedin.text), 3000), tags },
		x: { title, description: cut(clean(c.x.text), 280), tags }
	};
}

type Words = { w: string }[] | null;
export type CaptionSource = { description: string | null; reason: string | null; words: Words };

export async function generateCaptions(
	supabase: SupabaseClient,
	userId: string,
	clip: CaptionSource
): Promise<Record<Platform, Caption>> {
	const [{ profile }, rules] = await Promise.all([
		loadBrand(supabase, userId),
		supabase.from('brand_rules').select('rule, scope, status, evidence_count')
	]);
	const memory = buildMemoryContext(profile, (rules.data ?? []) as MemoryRule[], {
		scope: 'copy'
	});
	const transcript = (clip.words ?? [])
		.map((w) => w.w)
		.join(' ')
		.slice(0, 4000);
	const { data } = await generateJSON({
		userId,
		task: 'captions',
		schema: LLMCaptions,
		system: CAPTIONS_SYSTEM,
		prompt: [
			`Brand memory:\n${memory || '(none yet)'}`,
			`Clip description: ${clip.description || clip.reason || '(none)'}`,
			transcript && `Clip transcript: ${transcript}`
		]
			.filter(Boolean)
			.join('\n\n')
	});
	return toCaptions(data);
}

export type CaptionText = { title?: string; description: string; tags?: string[] };

/** edit_events row for a user edit of generated copy (contract in plans/STATUS.md). No-op when
 * nothing changed. */
export async function logCaptionEdit(
	supabase: SupabaseClient,
	userId: string,
	clipId: string,
	platform: Platform,
	before: CaptionText,
	after: CaptionText
) {
	if (JSON.stringify(before) === JSON.stringify(after)) return;
	const { error } = await supabase.from('edit_events').insert({
		user_id: userId,
		clip_id: clipId,
		op: 'caption_edit',
		source: 'manual',
		args: { platform, before, after },
		summary: `Edited the ${platform} caption`
	});
	if (error) console.error('caption_edit insert', error.message); // never block posting over it
}
