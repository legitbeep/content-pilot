import type { Timeline, Word } from '@clip-studio/timeline-schema';

export type RenderStatus = 'queued' | 'rendering' | 'done' | 'failed';

/** A clip as the editor sees it (`clips` row subset). */
export type EditorClip = {
	id: string;
	job_id: string;
	reason: string;
	start_s: number;
	end_s: number;
	file_key: string | null;
	file_start_s: number | null;
	file_end_s: number | null;
	words: Word[];
	render_status: RenderStatus | null;
	render_error: string | null;
};

/** One applied operation, as stored in `edit_events`. */
export type EditEvent = {
	op: string;
	args: unknown;
	summary: string;
	source: 'manual' | 'agent';
};

export type TimelineRow = { clip_id: string; data: Timeline; revision: number };

/** Every R2 key a timeline reads (segments' sources + audio tracks). */
export function timelineKeys(t: Timeline): string[] {
	return [
		...new Set([
			t.sourceKey,
			...t.segments.map((s) => s.sourceKey ?? t.sourceKey),
			...t.audio.map((a) => a.key)
		])
	];
}
