<script lang="ts">
	import { resolve } from '$app/paths';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import TrendingDownIcon from '@lucide/svelte/icons/trending-down';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';

	type Entry = { id: string; kind: string; message: string; data: { band?: string } };
	let { entries }: { entries: Entry[] } = $props();
</script>

{#if entries.length}
	<section class="flex flex-col gap-2" aria-label="What we learned">
		<h2 class="font-medium">What we learned</h2>
		<ul class="grid gap-2 md:grid-cols-2">
			{#each entries as e (e.id)}
				{@const Icon =
					e.kind === 'rule'
						? LightbulbIcon
						: e.data.band === 'downgrade'
							? TrendingDownIcon
							: TrendingUpIcon}
				<li class="flex items-start gap-3 rounded-lg border bg-card p-3">
					<Icon class="mt-0.5 shrink-0 text-muted-foreground" />
					<span>
						{e.message}
						{#if e.kind === 'rule'}
							<a href="{resolve('/brand')}?tab=learned" class="text-muted-foreground underline">Review</a>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}
