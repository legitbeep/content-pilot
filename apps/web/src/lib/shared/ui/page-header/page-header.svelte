<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, description, actions }: { title: string; description?: string; actions?: Snippet } =
		$props();
</script>

<header class="flex animate-in-fade flex-wrap items-start justify-between gap-x-4 gap-y-3 pb-6">
	<div class="min-w-0 flex-[1_1_16rem]">
		<h1 class="text-xl font-semibold tracking-tight">{title}</h1>
		{#if description}<p class="mt-1 max-w-prose text-muted-foreground">{description}</p>{/if}
	</div>
	{#if actions}<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>{/if}
</header>
