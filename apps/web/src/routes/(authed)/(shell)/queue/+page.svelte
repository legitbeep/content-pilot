<script lang="ts">
	import ListVideoIcon from '@lucide/svelte/icons/list-video';
	import { invalidate } from '$app/navigation';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
	import { UploadVideo } from '$lib/features/upload-video';
	import { JobQueue } from '$lib/widgets/job-queue';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// ponytail: 3s polling while work is in flight; switch to Supabase Realtime if it gets chatty.
	const active = $derived(
		data.jobs.some((j) => j.status === 'pending' || j.status === 'processing')
	);
	$effect(() => {
		if (!active) return;
		const t = setInterval(() => invalidate('app:jobs'), 3000);
		return () => clearInterval(t);
	});
</script>

<PageHeader title="Queue" description="Long videos being transcribed, checked and clipped." />

<div class="flex flex-col gap-6">
	<UploadVideo />
	{#if data.jobs.length}
		<JobQueue jobs={data.jobs} />
	{:else}
		<EmptyState icon={ListVideoIcon} text="No videos yet. Upload a long video to find clips." />
	{/if}
</div>
