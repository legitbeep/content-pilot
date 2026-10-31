<!-- Minimal vertical bar chart (no chart library). Bars use the info token; values in a title +
an sr-only list so the numbers are readable without hover. -->
<script lang="ts">
	let {
		data,
		label,
		format = (n: number) => n.toLocaleString()
	}: {
		data: { label: string; value: number }[];
		/** Accessible name, e.g. "Views per week". */
		label: string;
		format?: (n: number) => string;
	} = $props();

	const max = $derived(Math.max(1, ...data.map((d) => d.value)));
</script>

<figure class="flex flex-col gap-2" aria-label={label}>
	<div class="flex h-32 items-end gap-1" aria-hidden="true">
		{#each data as d (d.label)}
			<div class="flex h-full flex-1 flex-col justify-end" title="{d.label}: {format(d.value)}">
				<div
					class="min-h-px rounded-t-sm bg-info/70 hover:bg-info"
					style:height="{(d.value / max) * 100}%"
				></div>
			</div>
		{/each}
	</div>
	<div class="flex justify-between gap-1 text-xs text-muted-foreground" aria-hidden="true">
		{#if data.length <= 6}
			{#each data as d (d.label)}<span class="flex-1 text-center">{d.label}</span>{/each}
		{:else}
			<span>{data[0]?.label}</span>
			<span>{data.at(-1)?.label}</span>
		{/if}
	</div>
	<ul class="sr-only">
		{#each data as d (d.label)}<li>{d.label}: {format(d.value)}</li>{/each}
	</ul>
</figure>
