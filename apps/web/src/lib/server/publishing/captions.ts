// Docs: docs/publishing.md
// Captions per platform behind one interface. Template version now; plan 9 swaps in an LLM one.
import type { Platform } from '$lib/entities/post';

export type CaptionClip = { id: string; description: string | null; reason: string | null };
/** Brand defaults for copy; null = generic defaults. */
export type CaptionBrand = { cta?: string; hashtags?: string[] } | null;
export type Caption = { title: string; description: string; tags: string[] };

export interface CaptionGenerator {
	generate(clip: CaptionClip, platform: Platform, brand: CaptionBrand): Promise<Caption>;
}

const DEFAULT_CTA = 'Follow for more.';
const DEFAULT_HASHTAGS = ['#shorts', '#creator'];
/** YouTube rejects < and > in titles/descriptions. */
const clean = (s: string) => s.replace(/[<>]/g, '').trim();
const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

export const templateCaptions: CaptionGenerator = {
	async generate(clip, platform, brand) {
		const text = clean(clip.description || clip.reason || '');
		const hook = text.split(/(?<=[.!?])\s/)[0] ?? '';
		const hashtags = brand?.hashtags?.length ? brand.hashtags : DEFAULT_HASHTAGS;
		const cta = brand?.cta || DEFAULT_CTA;
		const tags = hashtags.map((h) => h.replace(/^#/, ''));
		const title = cut(hook.replace(/[.!?]$/, '') || 'New clip', 100);
		if (platform === 'x') {
			const tail = ` ${hashtags.join(' ')}`;
			return { title, description: cut(text, 280 - tail.length) + tail, tags };
		}
		const description = [text, cta, hashtags.join(' ')].filter(Boolean).join('\n\n');
		return { title, description: cut(description, platform === 'youtube' ? 5000 : 2200), tags };
	}
};
