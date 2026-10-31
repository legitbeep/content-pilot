import type { JobStatus } from '$lib/shared/ui/status-badge';

/** Render status → the shared status badge (null = never rendered, no badge). */
export const renderBadge = (s: string | null): JobStatus | null =>
	(({ queued: 'pending', rendering: 'processing', done: 'done', failed: 'failed' }) as const)[
		s as 'queued'
	] ?? null;
