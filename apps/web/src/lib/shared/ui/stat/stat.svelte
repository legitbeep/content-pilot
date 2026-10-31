<script lang="ts">
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import TrendingDownIcon from '@lucide/svelte/icons/trending-down';
	import { cn } from '$lib/shared/lib/utils';

	let {
		label,
		value,
		delta,
		hint,
		class: className
	}: {
		label: string;
		value: string | number;
		/** Percent change; positive is green, negative red, 0 muted. */
		delta?: number;
		/** Small muted line under the value, e.g. "vs last 7 days". */
		hint?: string;
		class?: string;
	} = $props();
</script>

<div class={cn('flex flex-col gap-1', className)}>
	<span class="text-xs text-muted-foreground">{label}</span>
	<span class="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
	{#if delta !== undefined || hint}
		<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
			{#if delta !== undefined}
				<span
					class={cn(
						'inline-flex items-center gap-0.5 font-medium tabular-nums',
						delta > 0 && 'text-success',
						delta < 0 && 'text-danger'
					)}
				>
					{#if delta > 0}<TrendingUpIcon class="size-3" />{:else if delta < 0}<TrendingDownIcon
							class="size-3"
						/>{/if}
					{delta > 0 ? '+' : ''}{delta}%
				</span>
			{/if}
			{#if hint}<span>{hint}</span>{/if}
		</span>
	{/if}
</div>
