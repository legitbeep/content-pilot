<script lang="ts">
	import { cn } from '$lib/shared/lib/utils';
	import type { PostStatus } from './model';

	let { status }: { status: PostStatus } = $props();

	const styles: Record<PostStatus, { label: string; class: string }> = {
		draft: { label: 'Draft', class: 'text-muted-foreground border-border' },
		scheduled: { label: 'Scheduled', class: 'text-foreground border-border-strong' },
		publishing: { label: 'Publishing', class: 'text-info border-info/30' },
		posted: { label: 'Posted', class: 'text-success border-success/30' },
		failed: { label: 'Failed', class: 'text-danger border-danger/30' },
		cancelled: { label: 'Cancelled', class: 'text-muted-foreground border-border' }
	};
	const s = $derived(styles[status]);
</script>

<span
	class={cn(
		'inline-flex h-5 items-center gap-1.5 rounded-sm border px-1.5 text-xs font-medium',
		s.class
	)}
>
	<span class={cn('size-1.5 rounded-full bg-current', status === 'publishing' && 'animate-pulse')}
	></span>
	{s.label}
</span>
