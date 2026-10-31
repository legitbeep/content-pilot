// Timeline operations: pure `(timeline, args) => { timeline, summary }`. The editor UI and the
// editor agent (plan 7, as tools) both apply them through `applyOp`. Args are plain JSON.
import { z } from 'zod';
import { duration, Timeline, type Segment } from '@clip-studio/timeline-schema';

export type OpResult = { timeline: Timeline; summary: string };

export type OpDef = {
	name: string;
	description: string;
	args: z.ZodType;
	/** Removes material; the agent asks before applying these. */
	destructive: boolean;
	/** Call through `applyOp`, which validates `args` first. */
	apply: (t: Timeline, args: never) => OpResult;
};

/** A user-readable reason an operation can't be applied. */
export class OpError extends Error {}

const sec = z.number().min(0);
const s = (n: number) => `${n.toFixed(1)}s`;
function fail(message: string): never {
	throw new OpError(message);
}

function def<const N extends string, S extends z.ZodType>(
	name: N,
	description: string,
	args: S,
	destructive: boolean,
	apply: (t: Timeline, args: z.infer<S>) => OpResult
): OpDef & { name: N } {
	return { name, description, args, destructive, apply };
}

/** Output-time start of each segment. */
function offsets(t: Timeline) {
	let o = 0;
	return t.segments.map((seg) => {
		const start = o;
		o += seg.end - seg.start;
		return start;
	});
}

/** Segment index under output time `at` and that time in the segment's source. */
export function locate(t: Timeline, at: number) {
	const starts = offsets(t);
	for (let i = 0; i < t.segments.length; i++) {
		const seg = t.segments[i];
		if (at < starts[i] + seg.end - seg.start || i === t.segments.length - 1)
			return { index: i, source: Math.min(seg.end, seg.start + Math.max(0, at - starts[i])) };
	}
	return { index: 0, source: t.segments[0].start };
}

function track(t: Timeline, id: string) {
	if (id === 'original') return null;
	return t.audio.find((a) => a.id === id) ?? fail(`No audio track "${id}".`);
}

const trackName = (id: string) => (id === 'original' ? 'original audio' : id.replace('-', ' '));
const segIndex = (t: Timeline, i: number) =>
	i < t.segments.length ? i : fail(`There is no segment ${i + 1}.`);

const trackId = z.string().min(1).describe('"original" or an added audio track id');
const position = z.enum(['top', 'center', 'bottom']);

export const ops = [
	def(
		'trim',
		'Set the in and/or out point of one segment (seconds of its source file).',
		z.strictObject({
			segment: z.number().int().min(0),
			start: sec.optional(),
			end: sec.optional()
		}),
		false,
		(t, a) => {
			const seg = t.segments[segIndex(t, a.segment)];
			t.segments[a.segment] = { ...seg, start: a.start ?? seg.start, end: a.end ?? seg.end };
			const n = t.segments[a.segment];
			if (n.end - n.start < 0.1) fail('A segment must be at least 0.1s long.');
			return {
				timeline: t,
				summary: `Trimmed segment ${a.segment + 1} to ${s(n.start)}-${s(n.end)}`
			};
		}
	),
	def(
		'split',
		'Split the segment under an output time into two segments.',
		z.strictObject({ at: sec.describe('Output time in seconds') }),
		false,
		(t, a) => {
			const { index, source } = locate(t, a.at);
			const seg = t.segments[index];
			if (source - seg.start < 0.1 || seg.end - source < 0.1)
				fail('Move the playhead inside a segment to split it.');
			t.segments.splice(index, 1, { ...seg, end: source }, { ...seg, start: source });
			return { timeline: t, summary: `Split at ${s(a.at)}` };
		}
	),
	def(
		'delete_range',
		'Cut out a range of the output timeline (seconds), across segments if needed.',
		z.strictObject({ start: sec, end: sec }),
		true,
		(t, a) => {
			if (a.end <= a.start) fail('The range to delete is empty.');
			const starts = offsets(t);
			const kept: Segment[] = [];
			t.segments.forEach((seg, i) => {
				const o = starts[i];
				const cutStart = seg.start + Math.max(0, a.start - o);
				const cutEnd = seg.start + Math.max(0, a.end - o);
				if (cutStart - seg.start >= 0.05) kept.push({ ...seg, end: Math.min(seg.end, cutStart) });
				if (seg.end - cutEnd >= 0.05) kept.push({ ...seg, start: Math.max(seg.start, cutEnd) });
			});
			if (!kept.length) fail("Can't delete the whole clip.");
			t.segments = kept;
			return { timeline: t, summary: `Deleted ${s(a.start)}-${s(a.end)}` };
		}
	),
	def(
		'reorder',
		'Move a segment to another position.',
		z.strictObject({ from: z.number().int().min(0), to: z.number().int().min(0) }),
		false,
		(t, a) => {
			const [seg] = t.segments.splice(segIndex(t, a.from), 1);
			t.segments.splice(Math.min(a.to, t.segments.length), 0, seg);
			return { timeline: t, summary: `Moved segment ${a.from + 1} to position ${a.to + 1}` };
		}
	),
	def(
		'merge_clip',
		'Insert a range of another clip file (or uploaded video) as a segment.',
		z.strictObject({
			sourceKey: z.string().min(1),
			start: sec,
			end: sec,
			at: z.number().int().min(0).optional().describe('Segment position; default: the end')
		}),
		false,
		(t, a) => {
			const seg: Segment = { start: a.start, end: a.end };
			if (a.sourceKey !== t.sourceKey) seg.sourceKey = a.sourceKey;
			t.segments.splice(a.at ?? t.segments.length, 0, seg);
			return { timeline: t, summary: `Added ${s(a.end - a.start)} from another clip` };
		}
	),
	def(
		'mute_track',
		'Mute or unmute the original audio or an added track.',
		z.strictObject({ track: trackId, muted: z.boolean() }),
		false,
		(t, a) => {
			const tr = track(t, a.track);
			(tr ?? t.originalAudio).muted = a.muted;
			return { timeline: t, summary: `${a.muted ? 'Muted' : 'Unmuted'} ${trackName(a.track)}` };
		}
	),
	def(
		'set_volume',
		'Set a track volume (1 = unchanged, 0..2).',
		z.strictObject({ track: trackId, volume: z.number().min(0).max(2) }),
		false,
		(t, a) => {
			(track(t, a.track) ?? t.originalAudio).volume = a.volume;
			return {
				timeline: t,
				summary: `Set ${trackName(a.track)} volume to ${Math.round(a.volume * 100)}%`
			};
		}
	),
	def(
		'add_audio',
		'Add a voiceover or music track (an uploaded R2 key) starting at an output time.',
		z.strictObject({
			kind: z.enum(['voiceover', 'music']),
			key: z.string().min(1),
			start: sec.default(0),
			volume: z.number().min(0).max(2).default(1)
		}),
		false,
		(t, a) => {
			const n = t.audio.filter((x) => x.kind === a.kind).length;
			let id = `${a.kind}-${n + 1}`;
			for (let i = n + 2; t.audio.some((x) => x.id === id); i++) id = `${a.kind}-${i}`;
			t.audio.push({
				id,
				kind: a.kind,
				key: a.key,
				start: a.start,
				volume: a.volume,
				muted: false
			});
			return { timeline: t, summary: `Added ${a.kind} at ${s(a.start)}` };
		}
	),
	def(
		'remove_audio',
		'Remove an added audio track.',
		z.strictObject({ track: z.string().min(1) }),
		true,
		(t, a) => {
			if (!track(t, a.track)) fail("The original audio can't be removed; mute it instead.");
			t.audio = t.audio.filter((x) => x.id !== a.track);
			return { timeline: t, summary: `Removed ${trackName(a.track)}` };
		}
	),
	def(
		'set_ducking',
		'Lower music automatically while speech (original audio or voiceover) plays.',
		z.strictObject({ enabled: z.boolean() }),
		false,
		(t, a) => {
			t.ducking = a.enabled;
			return { timeline: t, summary: `Turned music ducking ${a.enabled ? 'on' : 'off'}` };
		}
	),
	def(
		'set_aspect',
		'Set the output aspect ratio.',
		z.strictObject({ aspect: z.enum(['9:16', '1:1', '16:9']) }),
		false,
		(t, a) => {
			t.aspect = a.aspect;
			return { timeline: t, summary: `Switched to ${a.aspect}` };
		}
	),
	def(
		'set_crop_offset',
		'Move the crop horizontally (0 left, 0.5 centre, 1 right) when the source is wider.',
		z.strictObject({ x: z.number().min(0).max(1) }),
		false,
		(t, a) => {
			t.cropX = a.x;
			return { timeline: t, summary: `Moved crop to ${Math.round(a.x * 100)}% from the left` };
		}
	),
	def(
		'blur_region',
		'Blur a rectangle (fractions 0..1 of the output frame) between two output times.',
		z.strictObject({
			start: sec,
			end: sec,
			x: z.number().min(0).max(1),
			y: z.number().min(0).max(1),
			w: z.number().gt(0).max(1),
			h: z.number().gt(0).max(1)
		}),
		false,
		(t, a) => {
			t.blurRegions.push(a);
			return { timeline: t, summary: `Blurred a region from ${s(a.start)} to ${s(a.end)}` };
		}
	),
	def(
		'add_text_overlay',
		'Show text on screen between two output times.',
		z.strictObject({
			start: sec,
			end: sec,
			text: z.string().min(1).max(200),
			position: position.default('top')
		}),
		false,
		(t, a) => {
			t.textOverlays.push(a);
			return { timeline: t, summary: `Added text "${a.text}"` };
		}
	),
	def(
		'toggle_captions',
		'Turn burned-in captions on or off.',
		z.strictObject({ enabled: z.boolean() }),
		false,
		(t, a) => {
			t.captions.enabled = a.enabled;
			return { timeline: t, summary: `Turned captions ${a.enabled ? 'on' : 'off'}` };
		}
	),
	def(
		'set_caption_style',
		'Change caption font, colour (#RRGGBB), position, size or words per chunk.',
		z.strictObject({
			font: z.string().min(1).optional(),
			color: z
				.string()
				.regex(/^#[0-9A-Fa-f]{6}$/)
				.optional(),
			position: position.optional(),
			size: z.enum(['small', 'medium', 'large']).optional(),
			wordsPerChunk: z.number().int().min(1).max(5).optional()
		}),
		false,
		(t, a) => {
			const set = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
			t.captions.style = { ...t.captions.style, ...set };
			return { timeline: t, summary: `Changed caption ${Object.keys(set).join(', ') || 'style'}` };
		}
	)
] as const;

export type OpName = (typeof ops)[number]['name'];

/** Name, description, args schema and destructive flag of every op (plan 7 exposes these). */
export const opCatalog: readonly OpDef[] = ops;

/** Validate args, apply the op to a copy, validate the result. Throws OpError with a readable message. */
export function applyOp(t: Timeline, name: string, args: unknown): OpResult {
	const op = opCatalog.find((o) => o.name === name) ?? fail(`Unknown operation "${name}".`);
	const parsed = op.args.safeParse(args ?? {});
	if (!parsed.success) fail(`Invalid ${name}: ${z.prettifyError(parsed.error)}`);
	const result = (op.apply as (t: Timeline, a: unknown) => OpResult)(
		structuredClone(t),
		parsed.data
	);
	const valid = Timeline.safeParse(result.timeline);
	if (!valid.success) fail(`That edit makes the clip invalid: ${z.prettifyError(valid.error)}`);
	return { timeline: valid.data, summary: result.summary };
}

export { duration };
