import { describe, expect, it } from 'vitest';
import { applyPatterns, meaningful, type RuleRow } from './learn';

const ev = (clip: string, n = 1) => ({ kind: 'edit', event_id: `${clip}-${n}`, clip_id: clip });
const rule = (over: Partial<RuleRow>): RuleRow => ({
	id: 'r',
	rule: 'Rule',
	scope: 'editing',
	source: 'edits',
	status: 'candidate',
	evidence: [],
	evidence_count: 0,
	conflicts_with: null,
	...over
});
const pattern = (over: object) => ({
	rule: 'Cut the first 2 seconds of every clip.',
	scope: 'editing' as const,
	evidence: [ev('a')],
	same_as: null,
	contradicts: null,
	...over
});

describe('applyPatterns', () => {
	it('the same edit on 3 clips becomes a candidate that is ready (never active)', () => {
		const c = applyPatterns([], [pattern({ evidence: [ev('a'), ev('b'), ev('c')] })]);
		expect(c.inserts).toEqual([
			expect.objectContaining({ status: 'candidate', source: 'edits', evidence_count: 3 })
		]);
		expect(c.ready).toEqual(['Cut the first 2 seconds of every clip.']);
	});
	it('a new pattern starts at 1; a match adds evidence once per new clip', () => {
		expect(applyPatterns([], [pattern({})]).inserts[0].evidence_count).toBe(1);
		const existing = rule({ id: 'x', evidence: [ev('a'), ev('b')], evidence_count: 2 });
		const c = applyPatterns(
			[existing],
			[pattern({ same_as: 'x', evidence: [ev('b', 2), ev('c')] })]
		);
		expect(c.inserts).toEqual([]);
		expect(c.updates).toEqual([
			expect.objectContaining({ id: 'x', evidence_count: 3, evidence: expect.any(Array) })
		]);
		expect(c.updates[0].evidence).toHaveLength(4);
		expect(c.ready).toEqual(['Rule']);
	});
	it('matches identical text when the model gives no id', () => {
		const existing = rule({
			id: 'x',
			rule: 'Cut the first 2 seconds of every clip',
			evidence_count: 1,
			evidence: [ev('a')]
		});
		const c = applyPatterns([existing], [pattern({ evidence: [ev('b')] })]);
		expect(c.updates[0]).toMatchObject({ id: 'x', evidence_count: 2 });
	});
	it('skips patterns that are already rules or were dismissed', () => {
		for (const status of ['active', 'pinned', 'archived']) {
			const c = applyPatterns([rule({ id: 'x', status })], [pattern({ same_as: 'x' })]);
			expect(c.inserts.length + c.updates.length).toBe(0);
		}
	});
	it('records a conflict with an active rule, not with a candidate', () => {
		const stated = rule({
			id: 's',
			status: 'active',
			source: 'onboarding',
			rule: 'Keep the intro.'
		});
		const c = applyPatterns([stated], [pattern({ contradicts: 's' })]);
		expect(c.inserts[0].conflicts_with).toBe('s');
		expect(c.conflicts).toEqual([{ rule: c.inserts[0].rule, stated: 'Keep the intro.' }]);
		const other = applyPatterns([rule({ id: 'c' })], [pattern({ contradicts: 'c' })]);
		expect(other.inserts[0].conflicts_with).toBeNull();
	});
	it('ignores patterns without evidence', () => {
		expect(applyPatterns([], [pattern({ evidence: [] })]).inserts).toEqual([]);
	});
});

describe('meaningful', () => {
	const e = (clip_id: string, op: string, args: Record<string, unknown> = {}) => ({
		id: `${clip_id}-${op}`,
		clip_id,
		op,
		args,
		summary: op,
		source: 'manual',
		created_at: ''
	});
	const clips = { a: { start_s: 105, end_s: 115, file_start_s: 100 } }; // original segment 5-15
	it('drops undone edits, undo/redo and splits', () => {
		const out = meaningful(
			[e('a', 'set_aspect'), e('a', 'mute_track'), e('a', 'undo'), e('a', 'split'), e('a', 'redo')],
			clips
		);
		expect(out.map((x) => x.op)).toEqual(['set_aspect']);
	});
	it('drops small trims, keeps real ones', () => {
		expect(meaningful([e('a', 'trim', { segment: 0, start: 5.4 })], clips)).toEqual([]);
		expect(meaningful([e('a', 'trim', { segment: 0, start: 7 })], clips)).toHaveLength(1);
	});
	it('drops caption typo fixes, keeps rewrites', () => {
		const cap = (before: string, after: string) =>
			e('a', 'caption_edit', { platform: 'youtube', before, after });
		expect(meaningful([cap('How I grew my chanel', 'How I grew my channel')], clips)).toEqual([]);
		expect(meaningful([cap('How I grew my channel', 'Grow faster: 3 rules')], clips)).toHaveLength(
			1
		);
	});
});
