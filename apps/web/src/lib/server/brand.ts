// Docs: docs/brand-memory.md
// Brand profile load/save, logo presign and the stated_rules AI call. Shared by onboarding and
// the Brand Memory page. Uses the user's RLS client (owner-only rows).
import { error, fail, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	BrandProfile,
	DraftRules,
	profileFromRow,
	profileToRow,
	type DraftRule
} from '$lib/entities/brand';
import { AIError, generateJSON, requireAIKeys } from './llm';
import { presignGet, presignPut } from './r2';

export const ONBOARDING_STEPS = 8;

export async function loadBrand(supabase: SupabaseClient, userId: string) {
	const { data, error: err } = await supabase
		.from('brand_profile')
		.select('answers, example_posts, onboarding_step, onboarding_completed_at')
		.eq('user_id', userId)
		.maybeSingle();
	if (err) {
		console.error('brand_profile load failed', err);
		error(500, 'Could not load your brand profile.');
	}
	const profile = profileFromRow(data);
	const logoUrl = profile.logo_path ? await presignGet(profile.logo_path).catch(() => null) : null;
	return {
		profile,
		logoUrl,
		step: Math.min(Math.max(data?.onboarding_step ?? 1, 1), ONBOARDING_STEPS),
		completed: !!data?.onboarding_completed_at
	};
}

/** Merge a JSON patch of profile fields into the saved profile and upsert it. */
async function saveProfile(
	supabase: SupabaseClient,
	userId: string,
	patchJson: string,
	extra: { onboarding_step?: number } = {}
) {
	let patch: unknown;
	try {
		patch = JSON.parse(patchJson);
	} catch {
		patch = null;
	}
	if (!patch || typeof patch !== 'object' || Array.isArray(patch))
		return fail(400, { message: 'Could not read those answers.' });
	const { profile } = await loadBrand(supabase, userId);
	const merged = BrandProfile.parse({ ...profile, ...patch });
	// Logos only ever live under the user's own prefix.
	if (merged.logo_path && !merged.logo_path.startsWith(`brand/${userId}/`)) merged.logo_path = null;
	const { error: err } = await supabase.from('brand_profile').upsert({
		user_id: userId,
		...profileToRow(merged),
		...extra,
		updated_at: new Date().toISOString()
	});
	if (err) {
		console.error('brand_profile save failed', err);
		return fail(500, { message: 'Could not save. Try again.' });
	}
	return { profile: merged };
}

const LOGO_TYPES: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp'
};

/** Form actions shared by onboarding and /brand. */
export const profileActions = {
	/** Fields: patch (JSON of profile fields), step? (onboarding: the step being completed). */
	profile: async ({ request, locals: { supabase, user } }: RequestEvent) => {
		const form = await request.formData();
		const step = Number(form.get('step')) || null;
		// Onboarding's key step can't be passed without an LLM + transcription key (or demo).
		if (step === 1) await requireAIKeys(user!.id, 'both');
		const extra = step ? { onboarding_step: Math.min(step + 1, ONBOARDING_STEPS) } : {};
		return saveProfile(supabase, user!.id, String(form.get('patch') ?? ''), extra);
	},
	/** Presigned PUT for brand/{user_id}/logo.<ext>; the client then saves logo_path. */
	logo: async ({ request, locals: { user } }: RequestEvent) => {
		const form = await request.formData();
		const ext = LOGO_TYPES[String(form.get('type'))];
		if (!ext) return fail(400, { message: 'Logos can be PNG, JPG or WebP.' });
		if (Number(form.get('size')) > 2 * 1024 * 1024)
			return fail(400, { message: 'Logos must be 2 MB or smaller.' });
		const path = `brand/${user!.id}/logo.${ext}`;
		return { path, url: await presignPut(path, 600) };
	}
};

const STATED_RULES_SYSTEM = `You turn a creator's answers about their brand into short, concrete rules for AI tools that pick clips from their long videos, write post copy, style captions and edit videos.
- Each rule is one imperative sentence, specific and checkable (e.g. "Never use the word 'hustle'.", "Keep captions in Hinglish.").
- Give each rule a scope: clip_selection (which moments to clip), copy (titles, captions, descriptions), captions (on-video subtitles: font, colors, words), editing (pacing, look, logo), or all.
- Use only what the answers and example posts say or clearly imply. Learn voice from the liked posts and what to avoid from the disliked ones. Don't invent facts.
- 6 to 15 rules, no duplicates.
Return JSON: {"rules": [{"text": "...", "scope": "..."}]}`;

/** Task stated_rules: profile → draft rules (not saved). */
export async function generateStatedRules(userId: string, profile: BrandProfile) {
	const { logo_path, ...answers } = profile;
	const { data } = await generateJSON({
		userId,
		task: 'stated_rules',
		schema: DraftRules,
		system: STATED_RULES_SYSTEM,
		prompt: `Brand answers:\n${JSON.stringify({ ...answers, has_logo: !!logo_path }, null, 2)}`
	});
	return data.rules;
}

/** AIError → a failure the page shows as-is; anything else is a real bug and rethrows. */
export function aiFail(e: unknown) {
	if (e instanceof AIError)
		return fail(e.kind === 'missing_key' ? 409 : 502, { message: e.message });
	throw e;
}

/** A JSON list of draft rules posted by the review/regenerate UI. */
export function parseDrafts(v: FormDataEntryValue | null): DraftRule[] | null {
	try {
		const r = DraftRules.safeParse({ rules: JSON.parse(String(v)) });
		return r.success ? r.data.rules : null;
	} catch {
		return null;
	}
}

export const ruleRow = (userId: string, d: DraftRule, source: string, status: string) => ({
	user_id: userId,
	rule: d.text,
	scope: d.scope,
	source,
	status
});
