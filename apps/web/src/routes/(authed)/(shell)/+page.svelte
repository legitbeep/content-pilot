<script lang="ts">
	import { resolve } from '$app/paths';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import ScissorsIcon from '@lucide/svelte/icons/scissors';
	import SendIcon from '@lucide/svelte/icons/send';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { Button } from '$lib/shared/ui/button';
	import { Card } from '$lib/shared/ui/card';
	import { Stat } from '$lib/shared/ui/stat';
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
	const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

	const steps = [
		{
			icon: UploadIcon,
			title: 'Upload a long video',
			text: 'A podcast, stream or talk, up to 60 minutes. We transcribe it and find the moments worth clipping.'
		},
		{
			icon: ScissorsIcon,
			title: 'Pick and polish clips',
			text: 'Each clip comes with a reason. Keep the best, then trim, caption and reframe them in the editor.'
		},
		{
			icon: SendIcon,
			title: 'Publish and learn',
			text: 'Post to YouTube now or schedule it. Performance lands here and sharpens your brand memory.'
		}
	];
</script>

<div class="flex flex-col gap-8">
	<div class="relative overflow-hidden rounded-xl border bg-surface bg-abstract px-6 pt-6">
		<PageHeader
			title={data.posts.length ? 'Welcome back' : 'Welcome to Clip Studio'}
			description={data.posts.length
				? 'Your clips, how they performed, and what to make next.'
				: 'Turn one long video into short clips that sound like you, in three steps.'}
		>
			{#snippet actions()}
				<Button href={resolve('/queue')}><SparklesIcon /> Generate clips</Button>
			{/snippet}
		</PageHeader>
	</div>

	{#if !data.posts.length}
		<section class="flex flex-col gap-3" aria-labelledby="start-title">
			<div>
				<h2 id="start-title" class="text-base font-medium">Get started</h2>
				<p class="mt-0.5 text-muted-foreground">
					Once your first clips are posted, their performance shows up here.
				</p>
			</div>
			<ol class="grid gap-4 sm:grid-cols-3">
				{#each steps as s, i (s.title)}
					{@const Icon = s.icon}
					<li class="animate-in-fade" style:animation-delay="{i * 60}ms">
						<Card class="flex h-full flex-col gap-3 p-6">
							<span
								class="flex size-10 items-center justify-center rounded-lg border border-border-strong bg-elevated text-accent-text"
							>
								<Icon class="size-5" />
							</span>
							<h3 class="text-base font-medium">{i + 1}. {s.title}</h3>
							<p class="text-muted-foreground">{s.text}</p>
						</Card>
					</li>
				{/each}
			</ol>
		</section>
		<Recommendations youtubeConnected={data.youtubeConnected} saved={data.recommendations} />
	{:else}
		<section class="grid animate-in-fade gap-4 sm:grid-cols-3" aria-label="Key numbers">
			<Card><Stat label="Clips posted" value={stats.totals.posts} /></Card>
			<Card>
				<Stat
					label="Total views"
					value={compact.format(stats.totals.views)}
					hint="At each clip's latest checkpoint"
				/>
			</Card>
			<Card>
				<Stat
					label="Average score"
					value={stats.totals.avgScore === null ? '–' : `${stats.totals.avgScore.toFixed(1)}x`}
					hint={stats.totals.avgScore === null ? 'Needs 5 earlier videos' : 'Views vs your usual'}
				/>
			</Card>
		</section>
		<Recommendations youtubeConnected={data.youtubeConnected} saved={data.recommendations} />
		{#if nudges.length}
			<section class="flex flex-col gap-3" aria-label="Rate your clips">
				{#each nudges as n (n.post.id)}
					<RatingNudge post={n.post} score={n.score} />
				{/each}
			</section>
		{/if}
		<InsightCards entries={data.changeLog} />
		<PerformanceCharts {stats} />
	{/if}
</div>
