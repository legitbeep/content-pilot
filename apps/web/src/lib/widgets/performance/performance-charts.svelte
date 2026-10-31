<script lang="ts">
	import { BarChart } from '$lib/shared/ui/bar-chart';
	import { Button } from '$lib/shared/ui/button';
	import { Card } from '$lib/shared/ui/card';
	import type { homeStats } from './stats';

	let { stats }: { stats: ReturnType<typeof homeStats> } = $props();
	const scored = $derived(stats.scoreDist.reduce((n, b) => n + b.value, 0));
</script>

<div class="grid animate-in-fade gap-4 md:grid-cols-2">
	<Card title="Views over time" description="By week of posting, last 12 weeks">
		<BarChart data={stats.viewsByWeek} label="Views per week of posting, last 12 weeks" />
	</Card>
	<Card title="Posts per week" description="Last 12 weeks">
		<BarChart data={stats.postsByWeek} label="Posts per week, last 12 weeks" />
	</Card>
	<Card title="Top clips" description="By views at the latest checkpoint">
		{#if stats.top.length}
			<ol class="flex flex-col">
				{#each stats.top as t, i (t.id)}
					<li class="flex items-center gap-3 border-t py-2 first:border-t-0 first:pt-0">
						<span class="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
						{#if t.external_url}
							<Button
								variant="link"
								href={t.external_url}
								target="_blank"
								rel="noreferrer"
								class="h-auto min-w-0 flex-1 justify-start truncate p-0 text-foreground hover:text-accent-text"
								>{t.title ?? 'Untitled clip'}</Button
							>
						{:else}
							<span class="min-w-0 flex-1 truncate">{t.title ?? 'Untitled clip'}</span>
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
	</Card>
	<Card title="Score distribution" description="Views vs your usual">
		{#if scored}
			<BarChart data={stats.scoreDist} label="Posts by score (views vs your usual)" />
		{:else}
			<p class="text-muted-foreground">Not enough data yet. Scores need 5 earlier videos.</p>
		{/if}
		{#if stats.notEnoughData}
			<p class="mt-3 text-xs text-muted-foreground">
				{stats.notEnoughData} post{stats.notEnoughData === 1 ? '' : 's'} without a score yet (not enough
				data).
			</p>
		{/if}
	</Card>
</div>
