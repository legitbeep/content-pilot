<script lang="ts">
	import { BarChart } from '$lib/shared/ui/bar-chart';
	import { Button } from '$lib/shared/ui/button';
	import type { homeStats } from './stats';

	let { stats }: { stats: ReturnType<typeof homeStats> } = $props();
	const scored = $derived(stats.scoreDist.reduce((n, b) => n + b.value, 0));
</script>

<div class="grid gap-4 md:grid-cols-2">
	<section class="flex flex-col gap-3 rounded-lg border bg-card p-4">
		<h2 class="font-medium">Views over time</h2>
		<BarChart data={stats.viewsByWeek} label="Views per week of posting, last 12 weeks" />
	</section>
	<section class="flex flex-col gap-3 rounded-lg border bg-card p-4">
		<h2 class="font-medium">Posts per week</h2>
		<BarChart data={stats.postsByWeek} label="Posts per week, last 12 weeks" />
	</section>
	<section class="flex flex-col gap-3 rounded-lg border bg-card p-4">
		<h2 class="font-medium">Top clips</h2>
		{#if stats.top.length}
			<ol class="flex flex-col gap-2">
				{#each stats.top as t (t.id)}
					<li class="flex items-center justify-between gap-3">
						{#if t.external_url}
							<Button
								variant="link"
								href={t.external_url}
								target="_blank"
								rel="noreferrer"
								class="h-auto min-w-0 justify-start truncate p-0 text-foreground"
								>{t.title ?? 'Untitled clip'}</Button
							>
						{:else}
							<span class="truncate">{t.title ?? 'Untitled clip'}</span>
						{/if}
						<span class="shrink-0 text-muted-foreground tabular-nums">
							{t.views.toLocaleString()} views{t.score !== null ? ` · ${t.score.toFixed(1)}x` : ''}
						</span>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="text-muted-foreground">No measured posts yet.</p>
		{/if}
	</section>
	<section class="flex flex-col gap-3 rounded-lg border bg-card p-4">
		<h2 class="font-medium">Score distribution</h2>
		{#if scored}
			<BarChart data={stats.scoreDist} label="Posts by score (views vs your usual)" />
		{:else}
			<p class="text-muted-foreground">Not enough data yet. Scores need 5 earlier videos.</p>
		{/if}
		{#if stats.notEnoughData}
			<p class="text-xs text-muted-foreground">
				{stats.notEnoughData} post{stats.notEnoughData === 1 ? '' : 's'} without a score yet (not enough
				data).
			</p>
		{/if}
	</section>
</div>
