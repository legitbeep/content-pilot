// Docs: docs/brand-memory.md
// Brand profile (onboarding answers) and brand rules. Profile fields live in brand_profile.answers
// (jsonb) except example_posts, which has its own column.
import { z } from 'zod';

export const SCOPES = ['clip_selection', 'copy', 'captions', 'editing', 'all'] as const;
export const SOURCES = ['onboarding', 'edits', 'performance', 'manual'] as const;
export const STATUSES = ['candidate', 'active', 'pinned', 'archived'] as const;
export type Scope = (typeof SCOPES)[number];
export type Source = (typeof SOURCES)[number];
export type Status = (typeof STATUSES)[number];

export const scopeLabel: Record<Scope, string> = {
	clip_selection: 'Clip selection',
	copy: 'Copy',
	captions: 'Captions',
	editing: 'Editing',
	all: 'Everything'
};
export const sourceLabel: Record<Source, string> = {
	onboarding: 'You told us',
	edits: 'From edits',
	performance: 'From performance',
	manual: 'Added by you'
};

export const CAPTION_FONTS = [
	'Inter',
	'Montserrat',
	'Poppins',
	'Bebas Neue',
	'Anton',
	'Roboto'
] as const;
export const LANGUAGES = ['English', 'Hindi', 'Hinglish', 'Spanish', 'Portuguese'] as const;

const text = (max: number) => z.string().trim().max(max).catch('');
/** Forgiving list: trims, drops empties/duplicates, clips length and count. */
const list = (max: number, len = 80) =>
	z
		.array(z.unknown())
		.catch([])
		.transform((xs) =>
			[
				...new Set(
					xs
						.filter((x): x is string => typeof x === 'string')
						.map((x) => x.trim().slice(0, len))
						.filter(Boolean)
				)
			].slice(0, max)
		);
const pct = z.number().int().min(0).max(100).catch(50);

/** Every field falls back to its default, so old/partial rows (e.g. dev login's) still parse. */
export const BrandProfile = z.object({
	name: text(80),
	one_liner: text(200),
	niche: text(80),
	language: text(40),
	audience: text(600),
	core_topics: list(5),
	off_limits_topics: list(20),
	banned_words: list(50),
	tone: z
		.object({ casual_formal: pct, funny_serious: pct, bold_humble: pct })
		.catch({ casual_formal: 50, funny_serious: 50, bold_humble: 50 }),
	example_posts: list(5, 3000),
	disliked_posts: list(2, 3000),
	logo_path: z
		.string()
		.regex(/^brand\/[\w-]+\/logo\.(png|jpg|webp)$/)
		.nullable()
		.catch(null),
	colors: list(5, 7).transform((xs) => xs.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))),
	caption_font: z.enum(CAPTION_FONTS).nullable().catch(null),
	default_cta: text(200),
	default_hashtags: list(15, 60),
	posting_goal: z.number().int().min(0).max(50).nullable().catch(null)
});
export type BrandProfile = z.infer<typeof BrandProfile>;
export const emptyProfile = (): BrandProfile => BrandProfile.parse({});

export type ProfileRow = {
	answers: Record<string, unknown> | null;
	example_posts: unknown;
	onboarding_step?: number;
	onboarding_completed_at?: string | null;
};

export const profileFromRow = (row: ProfileRow | null): BrandProfile =>
	BrandProfile.parse({ ...(row?.answers ?? {}), example_posts: row?.example_posts ?? [] });

export function profileToRow(p: BrandProfile) {
	const { example_posts, ...answers } = p;
	return { answers, example_posts };
}

export type BrandRule = {
	id: string;
	rule: string;
	scope: Scope;
	source: Source;
	status: Status;
	evidence_count: number;
	evidence: unknown[];
	created_at: string;
	updated_at: string;
};

/** What the stated_rules task returns and what the review/regenerate lists edit. */
export const DraftRules = z.object({
	rules: z
		.array(z.object({ text: z.string().trim().min(3).max(300), scope: z.enum(SCOPES) }))
		.max(30)
});
export type DraftRule = z.infer<typeof DraftRules>['rules'][number];
