<script lang="ts">
	import { resolve } from '$app/paths';
	import HouseIcon from '@lucide/svelte/icons/house';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
	import { Button } from '$lib/shared/ui/button';
	import {
		homeStats,
		InsightCards,
		PerformanceCharts,
		RatingNudge,
		ratingNudges,
		Recommendations
	} from '$lib/widgets/performance';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const stats = $derived(homeStats(data.posts, data.metrics));
	const nudges = $derived(ratingNudges(data.posts, data.metrics));
</script>

<PageHeader title="Home" description="Your clips, how they performed, and what to make next.">
	{#snippet actions()}
		<Recommendations youtubeConnected={data.youtubeConnected} />
		<Button href={resolve('/queue')}>Generate clips</Button>
	{/snippet}
</PageHeader>

{#if !data.posts.length}
	<EmptyState
		icon={HouseIcon}
		text="Nothing posted yet. Generate clips from a long video, post them, and their performance shows up here."
	/>
{:else}
	<div class="flex flex-col gap-6">
		{#each nudges as n (n.post.id)}
			<RatingNudge post={n.post} score={n.score} />
		{/each}
		<InsightCards entries={data.changeLog} />
		<PerformanceCharts {stats} />
	</div>
{/if}
