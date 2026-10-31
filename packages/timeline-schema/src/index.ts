// Docs: docs/timeline.md
// Hand-mirrored from ../timeline.schema.json. Keep in sync with apps/worker/worker/timeline.py.
// JSON Schema can't express end > start or x + w <= 1; both mirrors enforce them.
import { z } from 'zod';

const seconds = z.number().min(0);
const fraction = z.number().min(0).max(1);
const volume = z.number().min(0).max(2);
const position = z.enum(['top', 'center', 'bottom']);

const range = { start: seconds, end: seconds };
const ordered = (r: { start: number; end: number }) => r.end > r.start;
const msg = { message: 'end must be greater than start' };

export const Segment = z
	.strictObject({ ...range, sourceKey: z.string().min(1).optional() })
	.refine(ordered, msg);
export const AudioTrack = z.strictObject({
	id: z.string().min(1),
	kind: z.enum(['voiceover', 'music']),
	key: z.string().min(1),
	start: seconds,
	volume,
	muted: z.boolean()
});
export const CaptionStyle = z.strictObject({
	font: z.string().min(1),
	color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
	position,
	size: z.enum(['small', 'medium', 'large']),
	wordsPerChunk: z.number().int().min(1).max(5),
	/** Text look; absent = 'outline'. */
	effect: z.enum(['outline', 'shadow', 'box']).optional()
});
export const TextOverlay = z
	.strictObject({ ...range, text: z.string().min(1), position })
	.refine(ordered, msg);
export const BlurRegion = z
	.strictObject({
		...range,
		x: fraction,
		y: fraction,
		w: z.number().gt(0).max(1),
		h: z.number().gt(0).max(1)
	})
	.refine(ordered, msg)
	.refine((r) => r.x + r.w <= 1 && r.y + r.h <= 1, { message: 'region must fit in the frame' });

export const Timeline = z.strictObject({
	version: z.literal(2),
	sourceKey: z.string().min(1),
	aspect: z.enum(['9:16', '1:1', '16:9']),
	cropX: fraction,
	segments: z.array(Segment).min(1),
	originalAudio: z.strictObject({ muted: z.boolean(), volume }),
	audio: z.array(AudioTrack),
	ducking: z.boolean(),
	captions: z.strictObject({ enabled: z.boolean(), style: CaptionStyle }),
	textOverlays: z.array(TextOverlay),
	blurRegions: z.array(BlurRegion)
});

export type Timeline = z.infer<typeof Timeline>;
export type Segment = z.infer<typeof Segment>;
export type AudioTrack = z.infer<typeof AudioTrack>;
export type CaptionStyle = z.infer<typeof CaptionStyle>;
export type Aspect = Timeline['aspect'];

/** A word of `clips.words`: times relative to that clip file. */
export type Word = { w: string; start: number; end: number };
export type CaptionChunk = { start: number; end: number; text: string };

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
	font: 'Hanken Grotesk',
	color: '#FFFFFF',
	position: 'bottom',
	size: 'medium',
	wordsPerChunk: 3
};

/** The initial timeline of a clip file: one segment, captions on, 9:16. */
export function newTimeline(sourceKey: string, start: number, end: number): Timeline {
	return {
		version: 2,
		sourceKey,
		aspect: '9:16',
		cropX: 0.5,
		segments: [{ start, end }],
		originalAudio: { muted: false, volume: 1 },
		audio: [],
		ducking: false,
		captions: { enabled: true, style: { ...DEFAULT_CAPTION_STYLE } },
		textOverlays: [],
		blurRegions: []
	};
}

export const segmentKey = (t: Timeline, s: Segment) => s.sourceKey ?? t.sourceKey;
export const duration = (t: Timeline) => t.segments.reduce((d, s) => d + s.end - s.start, 0);

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Caption chunks on the output timeline: words whose midpoint is inside a kept segment, mapped
 * through the segments, grouped `wordsPerChunk` at a time (never across a cut). Mirrored by
 * `caption_chunks` in apps/worker/worker/timeline.py; both are tested on fixtures/captions.json. */
export function captionChunks(t: Timeline, wordsByKey: Record<string, Word[]>): CaptionChunk[] {
	const chunks: CaptionChunk[] = [];
	const n = t.captions.style.wordsPerChunk;
	let offset = 0;
	for (const seg of t.segments) {
		const words = (wordsByKey[segmentKey(t, seg)] ?? []).filter((w) => {
			const mid = (w.start + w.end) / 2;
			return mid >= seg.start && mid < seg.end;
		});
		for (let i = 0; i < words.length; i += n) {
			const group = words.slice(i, i + n);
			chunks.push({
				start: round(Math.max(group[0].start, seg.start) - seg.start + offset),
				end: round(Math.min(group[group.length - 1].end, seg.end) - seg.start + offset),
				text: group.map((w) => w.w).join(' ')
			});
		}
		offset += seg.end - seg.start;
	}
	return chunks;
}
