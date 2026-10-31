// Docs: docs/brand-memory.md
// buildMemoryContext: brand profile + rules → a compact text block for prompts. Pure.
// Extraction, copy, captions and the editor agent all call this (scope → fields: docs/brand-memory.md).
import type { BrandProfile, BrandRule, Scope } from './model';

export const MEMORY_TOKEN_CAP = 1500;
/** ponytail: ~4 chars per token; swap for a real tokenizer if the cap ever needs to be exact. */
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

type Field = (p: BrandProfile) => string | null;
const join = (xs: string[]) => (xs.length ? xs.join(', ') : null);
const line = (label: string, v: string | null | undefined) => (v ? `${label}: ${v}` : null);
const clip = (s: string, n = 400) => (s.length > n ? `${s.slice(0, n)}…` : s);

const fields = {
	brand: (p) => line('Brand', [p.name, p.one_liner].filter(Boolean).join(' - ')),
	niche: (p) => line('Niche', p.niche),
	language: (p) => line('Content language', p.language),
	audience: (p) => line('Audience', p.audience),
	topics: (p) => line('Core topics', join(p.core_topics)),
	offLimits: (p) => line('Never cover', join(p.off_limits_topics)),
	banned: (p) => line('Never use these words', join(p.banned_words)),
	tone: ({ tone: t }) =>
		`Tone (0-100): casual→formal ${t.casual_formal}, funny→serious ${t.funny_serious}, bold→humble ${t.bold_humble}`,
	examples: (p) =>
		p.example_posts.length
			? ['Posts they like:', ...p.example_posts.map((x) => `- ${clip(x)}`)].join('\n')
			: null,
	disliked: (p) =>
		p.disliked_posts.length
			? ['Posts they dislike:', ...p.disliked_posts.map((x) => `- ${clip(x)}`)].join('\n')
			: null,
	font: (p) => line('Caption font', p.caption_font),
	colors: (p) => line('Brand colors', join(p.colors)),
	logo: (p) => (p.logo_path ? 'Has a logo' : null),
	cta: (p) => line('Default call to action', p.default_cta),
	hashtags: (p) => line('Default hashtags', join(p.default_hashtags)),
	goal: (p) => (p.posting_goal ? `Posting goal: ${p.posting_goal} per week` : null)
} satisfies Record<string, Field>;
type FieldName = keyof typeof fields;

/** Which profile fields each scope sees. Keep in sync with docs/brand-memory.md. */
export const SCOPE_FIELDS: Record<Scope, FieldName[]> = {
	clip_selection: ['brand', 'niche', 'language', 'audience', 'topics', 'offLimits', 'tone'],
	copy: [
		'brand',
		'niche',
		'language',
		'audience',
		'topics',
		'offLimits',
		'banned',
		'tone',
		'examples',
		'disliked',
		'cta',
		'hashtags'
	],
	captions: ['brand', 'language', 'banned', 'tone', 'font', 'colors'],
	editing: ['brand', 'tone', 'font', 'colors', 'logo'],
	all: Object.keys(fields) as FieldName[]
};

export type MemoryRule = Pick<BrandRule, 'rule' | 'scope' | 'status' | 'evidence_count'>;

/**
 * Profile fields for `scope`, then active + pinned rules whose scope is `scope` or "all"
 * (every rule when scope is "all"). Candidates/archived never. Order: pinned, rules mentioning
 * `topics`, then most evidence. Over `maxTokens`: drop the lowest-evidence non-pinned rule
 * until it fits; pinned rules are always kept.
 */
export function buildMemoryContext(
	profile: BrandProfile,
	rules: MemoryRule[],
	{
		scope,
		topics = [],
		maxTokens = MEMORY_TOKEN_CAP
	}: { scope: Scope; topics?: string[]; maxTokens?: number }
): string {
	const profileBlock = SCOPE_FIELDS[scope]
		.map((f) => fields[f](profile))
		.filter((x): x is string => !!x);
	const needles = topics.map((t) => t.trim().toLowerCase()).filter(Boolean);
	const hits = (r: MemoryRule) => needles.some((t) => r.rule.toLowerCase().includes(t));
	const pinned = (r: MemoryRule) => r.status === 'pinned';

	let kept = rules
		.filter((r) => r.status === 'active' || r.status === 'pinned')
		.filter((r) => scope === 'all' || r.scope === scope || r.scope === 'all')
		.sort(
			(a, b) =>
				+pinned(b) - +pinned(a) || +hits(b) - +hits(a) || b.evidence_count - a.evidence_count
		);

	const render = () =>
		[
			...profileBlock,
			...(kept.length ? ['Brand rules:', ...kept.map((r) => `- ${r.rule}`)] : [])
		].join('\n');

	let out = render();
	while (estimateTokens(out) > maxTokens) {
		const victim = kept
			.filter((r) => !pinned(r))
			.sort((a, b) => b.evidence_count - a.evidence_count || +hits(b) - +hits(a))
			.at(-1);
		if (!victim) break;
		kept = kept.filter((r) => r !== victim);
		out = render();
	}
	return out;
}
