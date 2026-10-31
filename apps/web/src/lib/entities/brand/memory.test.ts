import { describe, expect, it } from 'vitest';
import { buildMemoryContext, estimateTokens, type MemoryRule } from './memory';
import { BrandProfile } from './model';

const profile = BrandProfile.parse({
	name: 'Chai Code',
	one_liner: 'Coding explained over chai',
	niche: 'programming',
	language: 'Hinglish',
	core_topics: ['javascript', 'careers'],
	banned_words: ['hustle'],
	caption_font: 'Inter',
	colors: ['#F5C842'],
	example_posts: ['Why your first job matters less than you think']
});
const r = (rule: string, scope: MemoryRule['scope'], status: MemoryRule['status'], ev = 0) => ({
	rule,
	scope,
	status,
	evidence_count: ev
});

describe('buildMemoryContext', () => {
	it('filters profile fields and rules by scope', () => {
		const rules = [
			r('Pick hooks in the first 3s', 'clip_selection', 'active'),
			r('Captions in yellow', 'captions', 'active'),
			r('Keep it in Hinglish', 'all', 'active')
		];
		const out = buildMemoryContext(profile, rules, { scope: 'clip_selection' });
		expect(out).toContain('Pick hooks');
		expect(out).toContain('Keep it in Hinglish');
		expect(out).not.toContain('Captions in yellow');
		expect(out).toContain('Content language: Hinglish');
		expect(out).not.toContain('Caption font'); // captions/editing field only
		expect(out).not.toContain('Posts they like');
		expect(buildMemoryContext(profile, rules, { scope: 'all' })).toContain('Captions in yellow');
	});

	it('includes pinned, excludes candidates and archived', () => {
		const out = buildMemoryContext(
			profile,
			[
				r('Pinned one', 'copy', 'pinned'),
				r('Candidate one', 'copy', 'candidate', 9),
				r('Archived one', 'copy', 'archived', 9)
			],
			{ scope: 'copy' }
		);
		expect(out).toContain('Pinned one');
		expect(out).not.toContain('Candidate one');
		expect(out).not.toContain('Archived one');
	});

	it('ranks rules mentioning the topics first', () => {
		const out = buildMemoryContext(
			profile,
			[
				r('Lots of evidence', 'all', 'active', 5),
				r('Talk about careers honestly', 'all', 'active')
			],
			{ scope: 'copy', topics: ['Careers'] }
		);
		expect(out.indexOf('careers honestly')).toBeLessThan(out.indexOf('Lots of evidence'));
	});

	it('caps tokens by dropping the lowest-evidence rules, never pinned ones', () => {
		const filler = 'x'.repeat(400);
		const rules = [
			r(`pinned ${filler}`, 'all', 'pinned', 0),
			...Array.from({ length: 30 }, (_, i) => r(`rule${i}: ${filler}`, 'all', 'active', i))
		];
		const out = buildMemoryContext(profile, rules, { scope: 'all' });
		expect(estimateTokens(out)).toBeLessThanOrEqual(1500);
		expect(out).toContain('pinned');
		expect(out).toContain('rule29:'); // most evidence kept
		expect(out).not.toContain('rule0:'); // least evidence dropped first
	});
});
