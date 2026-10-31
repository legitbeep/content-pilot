// Docs: docs/publishing.md
export type Platform = 'youtube' | 'instagram' | 'linkedin' | 'x';
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'posted' | 'failed' | 'cancelled';

export type Post = {
	id: string;
	clip_id: string;
	platform: Platform;
	status: PostStatus;
	title: string | null;
	caption: string;
	tags: string[];
	scheduled_at: string | null;
	posted_at: string | null;
	external_id: string | null;
	external_url: string | null;
	error: string | null;
	attempts: number;
	created_at: string;
};

/** Only YouTube auto-posts; the rest are copy-only until their APIs are built. */
export const platforms: { id: Platform; name: string; autoPost: boolean }[] = [
	{ id: 'youtube', name: 'YouTube', autoPost: true },
	{ id: 'instagram', name: 'Instagram', autoPost: false },
	{ id: 'linkedin', name: 'LinkedIn', autoPost: false },
	{ id: 'x', name: 'X', autoPost: false }
];
export const platformName = (id: string) => platforms.find((p) => p.id === id)?.name ?? id;

export const postStatuses: PostStatus[] = [
	'scheduled',
	'publishing',
	'posted',
	'failed',
	'cancelled'
];

export type PostAction = 'reschedule' | 'edit' | 'cancel' | 'retry' | 'open';

const allowed: Record<PostAction, PostStatus[]> = {
	reschedule: ['scheduled', 'failed', 'cancelled'],
	edit: ['scheduled'],
	cancel: ['scheduled', 'failed'],
	retry: ['failed'],
	open: ['posted']
};

/** Which detail actions a post in `status` offers. `publishing` is locked by the worker. */
export const canPost = (status: PostStatus, action: PostAction) => allowed[action].includes(status);

/** Calendar dot colour per status (tokens only). */
export const statusDot: Record<PostStatus, string> = {
	draft: 'bg-muted-foreground',
	scheduled: 'bg-foreground',
	publishing: 'bg-info',
	posted: 'bg-success',
	failed: 'bg-danger',
	cancelled: 'bg-muted-foreground/50'
};
