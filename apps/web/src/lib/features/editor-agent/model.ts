// Editor agent plan format + executor. Pure: the server dry-runs a plan with `executePlan` to
// validate it, the browser runs the same steps for real through the editor. docs/agent.md
import { z } from 'zod';
import {
	applyOp,
	opCatalog,
	OpError,
	segmentKey,
	type Timeline,
	type Word
} from '$lib/entities/timeline';
import { SCOPES } from '$lib/entities/brand';

export const MAX_STEPS = 20;
export const AGENT_TOOLS = [
	...opCatalog.map((o) => o.name),
	'find_moment',
	'propose_memory_update'
];

export const PlanStep = z.object({
	id: z.string().min(1).max(20),
	clip_id: z.string().min(1),
	tool: z.string().min(1),
	args: z.record(z.string(), z.unknown()).default({}),
	depends_on: z.array(z.string()).default([]),
	summary: z.string().min(1).max(200)
});
export type PlanStep = z.infer<typeof PlanStep>;

export const FindMomentArgs = z.strictObject({ query: z.string().trim().min(1).max(200) });
export const MemoryProposal = z.strictObject({
	rule: z.string().trim().min(3).max(300),
	scope: z.enum(SCOPES).default('editing')
});
export type MemoryProposal = z.infer<typeof MemoryProposal>;

export type Range = { start: number; end: number; text: string };

/** What a plan may touch: the open clip, the words of every source, and the R2 keys it may use
 * (session clip files + the user's uploads). */
export type AgentContext = {
	clipId: string;
	wordsByKey: Record<string, Word[]>;
	keys: string[];
};

/** What the chat needs from the editor (EditorState fits). */
export type AgentHost = {
	readonly timeline: Timeline;
	readonly history: { present: unknown };
	apply(op: string, args: unknown, source: 'agent'): boolean;
	undo(): void;
};

export type StepResult =
	| { kind: 'op'; timeline: Timeline; summary: string }
	| { kind: 'moment'; ranges: Range[]; summary: string }
	| { kind: 'memory'; proposal: MemoryProposal; summary: string };

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Spoken words on the output timeline (midpoint inside a kept segment, like captions). */
export function outputWords(t: Timeline, wordsByKey: Record<string, Word[]>): Word[] {
	const out: Word[] = [];
	let offset = 0;
	for (const seg of t.segments) {
		for (const w of wordsByKey[segmentKey(t, seg)] ?? []) {
			const mid = (w.start + w.end) / 2;
			if (mid >= seg.start && mid < seg.end)
				out.push({
					w: w.w,
					start: r3(offset + Math.max(0, w.start - seg.start)),
					end: r3(offset + Math.min(seg.end, w.end) - seg.start)
				});
		}
		offset += seg.end - seg.start;
	}
	return out;
}

/** Where a phrase is said, on the output timeline. Works on the transcript only, not visuals. */
export function findMoment(
	t: Timeline,
	wordsByKey: Record<string, Word[]>,
	query: string
): Range[] {
	const out = outputWords(t, wordsByKey);
	const q = query.split(/\s+/).map(norm).filter(Boolean);
	if (!q.length) return [];
	const ranges: Range[] = [];
	for (let i = 0; i + q.length <= out.length; i++) {
		if (q.every((tok, j) => norm(out[i + j].w) === tok)) {
			const last = out[i + q.length - 1];
			ranges.push({
				start: out[i].start,
				end: last.end,
				text: out
					.slice(i, i + q.length)
					.map((w) => w.w)
					.join(' ')
			});
		}
	}
	return ranges;
}

/** Replace "$<stepId>.start" / "$<stepId>.end" with the first range a find_moment step found. */
export function resolveRefs(
	args: Record<string, unknown>,
	results: Record<string, StepResult>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(args).map(([k, v]) => {
			const m = typeof v === 'string' ? v.match(/^\$([\w-]+)\.(start|end)$/) : null;
			if (!m) return [k, v];
			const r = results[m[1]];
			if (r?.kind !== 'moment') throw new OpError(`Step ${m[1]} didn't find a moment to use.`);
			if (!r.ranges.length) throw new OpError(`"${m[1]}" found nothing in what's said.`);
			return [k, r.ranges[0][m[2] as 'start' | 'end']];
		})
	);
}

/** Sandbox checks a plan must pass before any step runs. Throws OpError. */
export function checkPlan(steps: PlanStep[], ctx: AgentContext) {
	if (steps.length > MAX_STEPS) throw new OpError(`Plans can have at most ${MAX_STEPS} steps.`);
	const ids = new Set<string>();
	for (const s of steps) {
		if (!AGENT_TOOLS.includes(s.tool)) throw new OpError(`Unknown tool "${s.tool}".`);
		if (s.clip_id !== ctx.clipId)
			throw new OpError('I can only edit the clip that is open. Open the other clip to edit it.');
		if (ids.has(s.id)) throw new OpError(`Duplicate step id "${s.id}".`);
		for (const d of s.depends_on)
			if (!ids.has(d)) throw new OpError(`Step ${s.id} depends on ${d}, which doesn't come first.`);
		ids.add(s.id);
		for (const k of ['sourceKey', 'key'])
			if (typeof s.args[k] === 'string' && !ctx.keys.includes(s.args[k] as string))
				throw new OpError(`Step ${s.id} uses a file that isn't in this session or your uploads.`);
	}
}

/** Run one step on a timeline. Throws OpError with a readable message. */
export function runStep(
	t: Timeline,
	step: PlanStep,
	results: Record<string, StepResult>,
	ctx: AgentContext
): StepResult {
	const args = resolveRefs(step.args, results);
	if (step.tool === 'find_moment') {
		const a = FindMomentArgs.safeParse(args);
		if (!a.success) throw new OpError(`Invalid find_moment: ${z.prettifyError(a.error)}`);
		const ranges = findMoment(t, ctx.wordsByKey, a.data.query);
		return {
			kind: 'moment',
			ranges,
			summary: ranges.length
				? `Found "${a.data.query}" at ${ranges.map((r) => `${r.start.toFixed(1)}s`).join(', ')}`
				: `"${a.data.query}" isn't said in this clip`
		};
	}
	if (step.tool === 'propose_memory_update') {
		const a = MemoryProposal.safeParse(args);
		if (!a.success) throw new OpError(`Invalid rule proposal: ${z.prettifyError(a.error)}`);
		return { kind: 'memory', proposal: a.data, summary: `Suggested rule: ${a.data.rule}` };
	}
	const r = applyOp(t, step.tool, args);
	return { kind: 'op', timeline: r.timeline, summary: r.summary };
}

export const isDestructive = (steps: PlanStep[]) =>
	steps.some((s) => opCatalog.find((o) => o.name === s.tool)?.destructive);

/** Dry run (server validation, tests): every step in order on a copy. Stops at the first failure. */
export function executePlan(t: Timeline, steps: PlanStep[], ctx: AgentContext) {
	const results: Record<string, StepResult> = {};
	let timeline = t;
	try {
		checkPlan(steps, ctx);
	} catch (e) {
		if (!(e instanceof OpError)) throw e;
		return { timeline, results, error: { step: null, message: e.message } };
	}
	for (const step of steps) {
		try {
			const r = runStep(timeline, step, results, ctx);
			results[step.id] = r;
			if (r.kind === 'op') timeline = r.timeline;
		} catch (e) {
			if (!(e instanceof OpError)) throw e;
			return { timeline, results, error: { step: step.id, message: e.message } };
		}
	}
	return { timeline, results, error: null };
}
