import { describe, expect, it } from 'vitest';
import { newTimeline } from '$lib/entities/timeline';
import { executePlan, findMoment, isDestructive, type AgentContext, type PlanStep } from './model';
import { encodeWav } from './voice';

const A = 'clips/a/source.mp4';
const B = 'clips/b/source.mp4';
const VO = 'uploads/u/seed-editor/voiceover.m4a';
const words = 'so here is the pricing myth nobody tells you'
	.split(' ')
	.map((w, i) => ({ w, start: 5 + i * 0.5, end: 5.4 + i * 0.5 }));
const ctx: AgentContext = { clipId: 'c1', wordsByKey: { [A]: words, [B]: [] }, keys: [A, B, VO] };
const t0 = { ...newTimeline(A, 5, 15), aspect: '16:9' as const };
const step = (id: string, tool: string, args: Record<string, unknown>): PlanStep => ({
	id,
	clip_id: 'c1',
	tool,
	args,
	depends_on: [],
	summary: id
});

describe('findMoment', () => {
	it('finds a phrase on the output timeline', () => {
		expect(findMoment(t0, ctx.wordsByKey, 'Pricing myth')).toEqual([
			{ start: 2, end: 2.9, text: 'pricing myth' }
		]);
	});
	it('maps through cuts', () => {
		const cut = { ...t0, segments: [{ start: 6, end: 15 }] };
		expect(findMoment(cut, ctx.wordsByKey, 'pricing')[0].start).toBe(1);
		expect(findMoment(cut, ctx.wordsByKey, 'so')).toEqual([]);
	});
});

describe('executePlan', () => {
	it('runs the acceptance plan (vertical, original 20%, voiceover, merge clip 2)', () => {
		const steps = [
			step('t1', 'set_aspect', { aspect: '9:16' }),
			step('t2', 'set_volume', { track: 'original', volume: 0.2 }),
			step('t3', 'add_audio', { kind: 'voiceover', key: VO }),
			step('t4', 'merge_clip', { sourceKey: B, start: 5, end: 15 })
		];
		const r = executePlan(t0, steps, ctx);
		expect(r.error).toBeNull();
		expect(r.timeline.aspect).toBe('9:16');
		expect(r.timeline.originalAudio).toEqual({ muted: false, volume: 0.2 });
		expect(r.timeline.audio[0]).toMatchObject({ id: 'voiceover-1', key: VO, start: 0 });
		expect(r.timeline.segments).toEqual([
			{ start: 5, end: 15 },
			{ start: 5, end: 15, sourceKey: B }
		]);
		expect(t0.aspect).toBe('16:9'); // input untouched
		expect(isDestructive(steps)).toBe(false);
	});
	it('uses find_moment results through $refs', () => {
		const r = executePlan(
			t0,
			[
				step('m', 'find_moment', { query: 'pricing myth' }),
				step('d', 'delete_range', { start: '$m.start', end: '$m.end' })
			],
			ctx
		);
		expect(r.error).toBeNull();
		expect(r.timeline.segments).toEqual([
			{ start: 5, end: 7 },
			{ start: 7.9, end: 15 }
		]);
	});
	it('stops at the first failing step with a readable message', () => {
		const r = executePlan(
			t0,
			[step('a', 'set_aspect', { aspect: '9:16' }), step('b', 'set_volume', { track: 'x' })],
			ctx
		);
		expect(r.error?.step).toBe('b');
		expect(r.timeline.aspect).toBe('9:16');
	});
	it('enforces the sandbox', () => {
		const bad = (steps: PlanStep[]) => executePlan(t0, steps, ctx).error?.message;
		expect(bad([step('a', 'rm_rf', {})])).toMatch(/Unknown tool/);
		expect(bad([{ ...step('a', 'set_aspect', { aspect: '1:1' }), clip_id: 'other' }])).toMatch(
			/only edit the clip that is open/
		);
		expect(bad([step('a', 'add_audio', { kind: 'music', key: 'uploads/else/x.mp3' })])).toMatch(
			/isn't in this session/
		);
		expect(bad(Array.from({ length: 21 }, (_, i) => step(`s${i}`, 'split', { at: 1 })))).toMatch(
			/at most 20/
		);
		expect(bad([{ ...step('a', 'split', { at: 1 }), depends_on: ['z'] }])).toMatch(/depends on/);
	});
	it('proposals are results, not timeline changes', () => {
		const r = executePlan(
			t0,
			[step('p', 'propose_memory_update', { rule: 'Always cut the first 2 seconds.' })],
			ctx
		);
		expect(r.results.p).toMatchObject({ kind: 'memory', proposal: { scope: 'editing' } });
		expect(r.timeline).toBe(t0);
	});
	it('flags destructive plans', () => {
		expect(isDestructive([step('a', 'delete_range', { start: 0, end: 1 })])).toBe(true);
	});
});

describe('encodeWav', () => {
	it('writes a 16 kHz mono PCM16 header', () => {
		const b = encodeWav(new Float32Array([0, 1, -1]));
		const v = new DataView(b.buffer);
		expect(new TextDecoder().decode(b.slice(0, 4))).toBe('RIFF');
		expect(v.getUint32(24, true)).toBe(16000);
		expect(v.getUint16(22, true)).toBe(1);
		expect(b.length).toBe(44 + 6);
		expect(v.getInt16(46, true)).toBe(0x7fff);
	});
});
