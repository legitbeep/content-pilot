<script lang="ts">
	import { resolve } from '$app/paths';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import TrendingDownIcon from '@lucide/svelte/icons/trending-down';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import { cn } from '$lib/shared/lib/utils';

	type Entry = { id: string; kind: string; message: string; data: { band?: string } };
	let { entries }: { entries: Entry[] } = $props();
</script>

{#if entries.length}
	<section class="flex flex-col gap-3" aria-labelledby="insights-title">
		<div>
			<h2 id="insights-title" class="text-base font-medium">What we learned</h2>
			<p class="mt-0.5 text-muted-foreground">From how your posted clips performed.</p>
		</div>
		<ul class="grid gap-4 sm:grid-cols-2">
			{#each entries as e, i (e.id)}
				{@const rule = e.kind === 'rule'}
				{@const down = !rule && e.data.band === 'downgrade'}
				{@const Icon = rule ? LightbulbIcon : down ? TrendingDownIcon : TrendingUpIcon}
				<li
					class="flex animate-in-fade items-start gap-3 rounded-xl border bg-surface bg-gradient-surface p-4"
					style:animation-delay="{i * 40}ms"
				>
					<span
						class={cn(
							'flex size-8 shrink-0 items-center justify-center rounded-lg border bg-elevated',
							rule ? 'text-accent-text' : down ? 'text-danger' : 'text-success'
						)}
					>
						<Icon />
					</span>
					<span class="min-w-0 pt-1.5">
						{e.message}
						{#if rule}
							<a
								href="{resolve('/brand')}?tab=learned"
								class="ml-1 rounded-sm text-accent-text underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
								>Review</a
							>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}
