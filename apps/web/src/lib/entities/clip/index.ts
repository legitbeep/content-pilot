// Docs: docs/pipeline.md
// A clip candidate as the Clip Picker reads it (columns written by the worker's extract_clips).

export type ClipCandidate = {
	id: string;
	start_s: number;
	end_s: number;
	hook: string | null;
	reason: string;
	reasons: string[];
	description: string | null;
	scores: Record<string, number>;
	ranking_score: number | null;
	words: { w: string; start: number; end: number }[];
	file_start_s: number | null;
	file_key: string | null;
	thumb_key: string | null;
	selected: boolean;
};

/** Reason chips for a rejection, stored as clip_feedback.reason. */
export const REJECT_REASONS = ['Off-brand', 'Boring', 'Too long', 'Bad cut', 'Other'] as const;

/** The clip's words (times relative to the clip file) inside the clip itself, without handles. */
export function excerpt(c: ClipCandidate, maxWords = 40): string {
	const from = c.start_s - (c.file_start_s ?? c.start_s);
	const to = from + (c.end_s - c.start_s);
	const words = c.words.filter((w) => w.start >= from && w.end <= to + 0.01).map((w) => w.w);
	return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}…` : words.join(' ');
}
