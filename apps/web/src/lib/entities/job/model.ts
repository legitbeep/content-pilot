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
	input_request: InputRequest | null;
	memory_snapshot?: string | null;
	user_intent?: string | null;
	error: string | null;
	error_detail: string | null;
	note: string | null;
	transcript_path: string | null;
	created_at: string;
	finished_at: string | null;
};

/** What a paused (needs_input) job asks, written by the worker's NeedsInput (docs/pipeline.md).
 * `options` are one-click answers; "Cancel" deletes the job. `flagged`: nsfw_check time ranges. */
export type InputRequest = {
	kind?: 'nsfw' | 'brand_fit';
	question?: string;
	options?: string[];
	allow_text?: boolean;
	flagged?: { start: number; end: number; why: string }[];
	answer?: string;
};

/** Normalised transcript in R2 at transcripts/<job_id>.json (docs/pipeline.md).
 * speaker is null when the provider has no speaker labels (Groq Whisper). */
export type Transcript = {
	provider: string;
	duration_s: number;
	words: { w: string; start: number; end: number; speaker: number | null }[];
	utterances: { speaker: number | null; start: number; end: number; text: string }[];
};

/** Upload limits + usage caps (docs/queue.md "Usage caps"). Size/length are checked in the browser
 * and again on the server/worker; jobsPerDay in `$lib/server/usage.ts`; processingPerUser mirrors
 * the worker's claim query (MAX_PROCESSING_PER_USER in apps/worker/main.py). */
export const UPLOAD_LIMITS = {
	maxBytes: 2 * 1024 ** 3,
	maxSeconds: 60 * 60,
	jobsPerDay: 5,
	processingPerUser: 2
};

export const stepLabels: Record<string, string> = {
	probe: 'Checking video',
	transcribe: 'Transcribing',
	nsfw_check: 'Checking content',
	brand_fit: 'Checking brand fit',
	extract_clips: 'Finding clips'
};
