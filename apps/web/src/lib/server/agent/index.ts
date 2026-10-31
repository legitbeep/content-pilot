// Docs: docs/agent.md
// Editor agent: understand a messy request (task understand_request), plan it as tool steps
// (task plan_edits), dry-run the plan, re-plan once on failure. The browser executes the plan.
import { z } from 'zod';
import { opCatalog, type EditorClip, type Timeline } from '$lib/entities/timeline';
import {
	executePlan,
	outputWords,
	PlanStep,
	MAX_STEPS,
	type AgentContext
} from '$lib/features/editor-agent';
import { generateJSON } from '../llm';

export const Understood = z.object({
	request: z.string().trim().max(2000),
	side_notes: z.array(z.string().trim().min(1).max(300)).max(10).default([])
});
export type Understood = z.infer<typeof Understood>;

export const PlanOut = z.object({
	steps: z.array(PlanStep).max(MAX_STEPS),
	reply: z.string().max(500).default('')
});
export type PlanOut = z.infer<typeof PlanOut>;

/** Everything the planner sees about this editing session. */
export type PlanInput = {
	userId: string;
	clip: EditorClip;
	clips: EditorClip[];
	timeline: Timeline;
	uploads: string[];
	memory: string;
};

const UNDERSTAND_SYSTEM = `You clean up a creator's spoken or typed request to a video editor assistant.
- The last correction wins: "Tuesday, no wait, Thursday" means Thursday; "mute it, no, lower it to 20%" means lower it to 20%.
- Drop fillers (uh, um, like, you know) and false starts.
- Attach late modifiers to the right thing ("make the text yellow... the title I mean" = the title text is yellow).
- Anything that is not an edit to the clip (reminders, digressions, notes to self) goes to side_notes, not the request.
- Keep the creator's meaning and numbers; don't add edits they didn't ask for.
Return JSON: {"request": "<clean request, empty if there is no edit>", "side_notes": ["..."]}`;

export async function understand(userId: string, message: string): Promise<Understood> {
	const { data } = await generateJSON({
		userId,
		task: 'understand_request',
		schema: Understood,
		system: UNDERSTAND_SYSTEM,
		prompt: message
	});
	return data;
}

const toolList = () =>
	[
		...opCatalog.map(
			(o) =>
				`- ${o.name}${o.destructive ? ' (destructive)' : ''}: ${o.description} Args JSON schema: ${JSON.stringify(z.toJSONSchema(o.args, { io: 'input' }))}`
		),
		'- find_moment: Find where a phrase is SAID in the open clip (transcript only, not visuals). Args: {"query": "<words>"}. Later steps can use "$<step id>.start" / "$<step id>.end" as a number arg.',
		'- propose_memory_update: Suggest a brand rule for future clips when the creator says "always"/"never"/"from now on". Args: {"rule": "<one imperative sentence>", "scope": "editing" | "captions" | "copy" | "clip_selection" | "all"}. It is only a suggestion the creator reviews later.'
	].join('\n');

const PLAN_SYSTEM =
	() => `You plan edits for one short video clip. The clip is a timeline JSON; you change it only with these tools:
${toolList()}

Rules:
- Return a todo list of steps in order: {"id": "t1", "clip_id": "<open clip id>", "tool": "<tool>", "args": {...}, "depends_on": ["t0"], "summary": "<short sentence>"}.
- clip_id is always the open clip's id. At most ${MAX_STEPS} steps. Use only the tools above, with args matching their schema exactly.
- Times: "output" seconds are on the edited clip as it plays now (see the transcript). Segment trims use source-file seconds (see segments).
- "Vertical" = aspect 9:16, "square" = 1:1, "horizontal"/"landscape" = 16:9. Volumes: 20% = 0.2.
- "my voiceover"/"my music": use the matching uploaded file key below; if none is listed, don't invent one, say so in reply.
- "Merge clip N" / "add clip N": merge_clip with that session clip's file key and its range (default at the end).
- If the request can't be done with these tools (e.g. it depends on what is shown on screen), return no steps and explain in reply.
- reply: one short sentence to the creator (what you'll do, or why not).
Return JSON: {"steps": [...], "reply": "..."}`;

function planPrompt(input: PlanInput, request: string, previousError?: string) {
	const { clip, clips, timeline, uploads, memory } = input;
	const words = outputWords(timeline, { [clip.file_key ?? '']: clip.words ?? [] })
		.map((w) => `${w.start.toFixed(1)} ${w.w}`)
		.join(' | ');
	const session = clips
		.map((c, i) => {
			const off = c.file_start_s ?? c.start_s;
			const range = `${(c.start_s - off).toFixed(1)}-${(c.end_s - off).toFixed(1)}`;
			return `- clip ${i + 1}${c.id === clip.id ? ' (OPEN)' : ''}: id ${c.id}, file key ${c.file_key}, clip range in file ${range}s, "${c.reason}"`;
		})
		.join('\n');
	return [
		`Request: ${request}`,
		`Open clip id: ${clip.id}`,
		`Session clips:\n${session}`,
		`Uploaded files (keys): ${uploads.length ? uploads.join(', ') : 'none'}`,
		`Timeline JSON: ${JSON.stringify(timeline)}`,
		`Transcript of the open clip (output seconds, word): ${words || 'none'}`,
		memory ? `Brand memory:\n${memory}` : '',
		previousError
			? `Your previous plan failed: ${previousError}\nFix it and return the full plan again.`
			: ''
	]
		.filter(Boolean)
		.join('\n\n');
}

export function agentContext(input: Pick<PlanInput, 'clip' | 'clips' | 'uploads'>): AgentContext {
	const files = input.clips.filter((c) => c.file_key);
	return {
		clipId: input.clip.id,
		wordsByKey: Object.fromEntries(files.map((c) => [c.file_key!, c.words ?? []])),
		keys: [...files.map((c) => c.file_key!), ...input.uploads]
	};
}

/** Plan → dry run → on failure re-plan once with the error. Throws Error with a readable message. */
export async function planEdits(input: PlanInput, request: string): Promise<PlanOut> {
	const ctx = agentContext(input);
	let lastError: string | undefined;
	for (let attempt = 0; attempt < 2; attempt++) {
		const { data } = await generateJSON({
			userId: input.userId,
			task: 'plan_edits',
			schema: PlanOut,
			system: PLAN_SYSTEM(),
			prompt: planPrompt(input, request, lastError)
		});
		const run = executePlan(input.timeline, data.steps, ctx);
		if (!run.error) return data;
		lastError = run.error.step ? `step ${run.error.step}: ${run.error.message}` : run.error.message;
	}
	throw new PlanError(`I couldn't make a plan that works: ${lastError}`);
}

export class PlanError extends Error {}
