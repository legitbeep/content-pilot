// Docs: docs/timeline.md
// Hand-mirrored from ../timeline.schema.json. Keep in sync with apps/worker/worker/timeline.py.
// JSON Schema can't express end > start; both mirrors enforce it.
import { z } from 'zod';

const seconds = z.number().min(0);

const range = { start: seconds, end: seconds };
const ordered = (r: { start: number; end: number }) => r.end > r.start;
const msg = { message: 'end must be greater than start' };

export const Range = z.strictObject(range).refine(ordered, msg);
export const Caption = z.strictObject({ ...range, text: z.string().min(1) }).refine(ordered, msg);
export const TextOverlay = z
	.strictObject({ ...range, text: z.string().min(1), position: z.enum(['top', 'center', 'bottom']) })
	.refine(ordered, msg);

export const Timeline = z.strictObject({
	version: z.literal(1),
	sourceKey: z.string().min(1),
	aspect: z.enum(['9:16', '1:1', '16:9']),
	segments: z.array(Range).min(1),
	captions: z.array(Caption),
	textOverlays: z.array(TextOverlay)
});

export type Timeline = z.infer<typeof Timeline>;
