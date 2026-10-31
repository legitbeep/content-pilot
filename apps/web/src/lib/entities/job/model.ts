// Docs: docs/queue.md
import type { JobStatus } from '$lib/shared/ui/status-badge';

export type { JobStatus };

export type JobStep = {
	step: string;
	status: 'running' | 'done' | 'failed' | 'stopped';
	started_at: string;
	finished_at?: string;
};

export type Job = {
	id: string;
	status: JobStatus;
	position: number;
	source_key: string;
	title: string | null;
	request: string | null;
	duration_s: number | null;
	media: { duration_s: number; width: number; height: number; has_audio: boolean } | null;
	current_step: string | null;
	progress: number;
	steps: JobStep[];
	stop_requested: boolean;
	input_request: { question?: string; answer?: string } | null;
	error: string | null;
	error_detail: string | null;
	note: string | null;
	transcript_path: string | null;
	created_at: string;
	finished_at: string | null;
};

/** Normalised transcript in R2 at transcripts/<job_id>.json (docs/pipeline.md).
 * speaker is null when the provider has no speaker labels (Groq Whisper). */
export type Transcript = {
	provider: string;
	duration_s: number;
	words: { w: string; start: number; end: number; speaker: number | null }[];
	utterances: { speaker: number | null; start: number; end: number; text: string }[];
};

/** Upload limits, checked in the browser and again on the server. */
export const UPLOAD_LIMITS = { maxBytes: 2 * 1024 ** 3, maxSeconds: 60 * 60 };

export const stepLabels: Record<string, string> = {
	probe: 'Checking video',
	transcribe: 'Transcribing',
	nsfw_check: 'Checking content',
	brand_fit: 'Checking brand fit',
	extract_clips: 'Finding clips'
};
