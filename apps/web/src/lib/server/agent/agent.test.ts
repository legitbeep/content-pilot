// Planner tests: recorded LLM output (mocked generateJSON), validated against the real schemas.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newTimeline, type EditorClip } from '$lib/entities/timeline';
import { PlanError, PlanOut, planEdits, understand, Understood } from './index';

const generateJSON = vi.hoisted(() => vi.fn());
vi.mock('../llm', () => ({ generateJSON }));

const A = 'clips/a/source.mp4';
const B = 'clips/b/source.mp4';
const VO = 'uploads/u/seed-editor/voiceover.m4a';
const clip = (id: string, key: string): EditorClip => ({
	id,
	job_id: 'j',
	reason: 'r',
	start_s: 105,
	end_s: 115,
	file_key: key,
	file_start_s: 100,
	file_end_s: 120,
	words: [],
	render_status: null,
	render_error: null
});
const input = {
	userId: 'u',
	clip: clip('c1', A),
	clips: [clip('c1', A), clip('c2', B)],
	timeline: { ...newTimeline(A, 5, 15), aspect: '16:9' as const },
	uploads: [VO],
	memory: ''
};

const MESSAGE =
	'make it vertical, uh, mute the original, no wait, lower it to 20 percent, and add my voiceover, then merge clip 2 at the end. oh and remind me to call the guest';
// Recorded shape of a good understand_request answer for MESSAGE.
const UNDERSTOOD = {
	request:
		'Make it vertical, lower the original audio to 20 percent, add my voiceover, then merge clip 2 at the end.',
	side_notes: ['Remind me to call the guest']
};
const step = (id: string, tool: string, args: object) => ({
	id,
	clip_id: 'c1',
	tool,
	args,
	depends_on: [],
	summary: id
});
const GOOD_PLAN = {
	steps: [
		step('t1', 'set_aspect', { aspect: '9:16' }),
		step('t2', 'set_volume', { track: 'original', volume: 0.2 }),
		step('t3', 'add_audio', { kind: 'voiceover', key: VO, start: 0 }),
		step('t4', 'merge_clip', { sourceKey: B, start: 5, end: 15 })
	],
	reply: 'Making it vertical, lowering the original to 20%, adding your voiceover and clip 2.'
};
/** generateJSON validates with the caller's schema, like the real adapter. */
const answer = (v: unknown) => (o: { schema: { parse: (x: unknown) => unknown } }) =>
	Promise.resolve({ data: o.schema.parse(v) });

beforeEach(() => generateJSON.mockReset());

describe('understand', () => {
	it('returns the clean request and side notes', async () => {
		generateJSON.mockImplementationOnce(answer(UNDERSTOOD));
		expect(await understand('u', MESSAGE)).toEqual(UNDERSTOOD);
		expect(generateJSON.mock.calls[0][0]).toMatchObject({
			task: 'understand_request',
			prompt: MESSAGE,
			schema: Understood
		});
	});
});

describe('planEdits', () => {
	it('returns a plan that passes the dry run', async () => {
		generateJSON.mockImplementationOnce(answer(GOOD_PLAN));
		const plan = await planEdits(input, UNDERSTOOD.request);
		expect(plan.steps.map((s) => s.tool)).toEqual([
			'set_aspect',
			'set_volume',
			'add_audio',
			'merge_clip'
		]);
		const call = generateJSON.mock.calls[0][0];
		expect(call).toMatchObject({ task: 'plan_edits', schema: PlanOut });
		expect(call.prompt).toContain(VO);
		expect(call.prompt).toContain(`clip 2: id c2, file key ${B}, clip range in file 5.0-15.0s`);
		expect(call.system).toContain('merge_clip');
	});
	it('re-plans once with the error', async () => {
		generateJSON
			.mockImplementationOnce(
				answer({ steps: [step('t1', 'set_volume', { track: 'original', volume: 20 })] })
			)
			.mockImplementationOnce(answer(GOOD_PLAN));
		const plan = await planEdits(input, UNDERSTOOD.request);
		expect(plan.steps).toHaveLength(4);
		expect(generateJSON.mock.calls[1][0].prompt).toMatch(/previous plan failed: step t1/);
	});
	it('gives up after the second failure', async () => {
		const bad = answer({ steps: [step('t1', 'explode', {})] });
		generateJSON.mockImplementationOnce(bad).mockImplementationOnce(bad);
		await expect(planEdits(input, 'x')).rejects.toThrow(PlanError);
		expect(generateJSON).toHaveBeenCalledTimes(2);
	});
	it('rejects plans over 20 steps at the schema', () => {
		const steps = Array.from({ length: 21 }, (_, i) => step(`s${i}`, 'split', { at: 1 }));
		expect(PlanOut.safeParse({ steps }).success).toBe(false);
	});
});
