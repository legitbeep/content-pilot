<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, description, actions }: { title: string; description?: string; actions?: Snippet } =
		$props();
</script>

<header class="flex items-start justify-between gap-4 pb-6">
	<div class="min-w-0">
		<h1 class="text-xl font-semibold">{title}</h1>
		{#if description}<p class="mt-1 text-muted-foreground">{description}</p>{/if}
	</div>
	{#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
</header>
