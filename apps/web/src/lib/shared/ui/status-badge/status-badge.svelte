<script lang="ts" module>
	export type JobStatus = 'pending' | 'processing' | 'needs_input' | 'done' | 'stopped' | 'failed';
</script>

<script lang="ts">
	import CircleSlashIcon from '@lucide/svelte/icons/circle-slash';
	import { cn } from '$lib/shared/lib/utils';

	let { status }: { status: JobStatus } = $props();

	const styles: Record<JobStatus, { label: string; class: string }> = {
		pending: { label: 'Pending', class: 'text-muted-foreground border-border' },
		processing: { label: 'Processing', class: 'text-info border-info/30' },
		needs_input: { label: 'Needs input', class: 'text-accent border-accent/40' },
		done: { label: 'Done', class: 'text-success border-success/30' },
		stopped: { label: 'Stopped', class: 'text-muted-foreground border-border' },
		failed: { label: 'Failed', class: 'text-danger border-danger/30' }
	};
	const s = $derived(styles[status]);
</script>

<span
	class={cn(
		'inline-flex h-5 items-center gap-1.5 rounded-sm border px-1.5 text-xs font-medium',
		s.class
	)}
>
	{#if status === 'stopped'}
		<CircleSlashIcon class="size-3" />
	{:else}
		<span class={cn('size-1.5 rounded-full bg-current', status === 'processing' && 'animate-pulse')}
		></span>
	{/if}
	{s.label}
</span>
