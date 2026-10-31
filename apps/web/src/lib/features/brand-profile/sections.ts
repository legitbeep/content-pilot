import type { BrandProfile } from '$lib/entities/brand';

/** Profile sections, in onboarding order (steps 2-7). /brand shows the same sections. */
export const sections = [
	{ id: 'basics', title: 'Basics', description: 'What your brand is called and what it is about.' },
	{ id: 'audience', title: 'Audience', description: 'Who watches and what they care about.' },
	{ id: 'content', title: 'Content', description: 'What you talk about, and what you never do.' },
	{ id: 'voice', title: 'Voice', description: 'How you sound, with a few posts as examples.' },
	{ id: 'visual', title: 'Visual', description: 'Logo, colors and caption font.' },
	{ id: 'publishing', title: 'Publishing defaults', description: 'What goes on every post.' }
] as const;
export type Section = (typeof sections)[number]['id'];

/** The profile fields each section edits (what a section's save sends). */
export const sectionFields: Record<Section, (keyof BrandProfile)[]> = {
	basics: ['name', 'one_liner', 'niche', 'language'],
	audience: ['audience'],
	content: ['core_topics', 'off_limits_topics', 'banned_words'],
	voice: ['tone', 'example_posts', 'disliked_posts'],
	visual: ['logo_path', 'colors', 'caption_font'],
	publishing: ['default_cta', 'default_hashtags', 'posting_goal']
};

export const pickSection = (p: BrandProfile, s: Section) =>
	Object.fromEntries(sectionFields[s].map((k) => [k, p[k]]));
