<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/shared/lib/utils';

	let {
		title,
		description,
		actions,
		href,
		class: className,
		children
	}: {
		title?: string;
		description?: string;
		/** Right side of the header: buttons, a menu, a CopyButton. */
		actions?: Snippet;
		/** Makes the whole card a link with a hover state. Don't put other links inside. */
		href?: string;
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<svelte:element
	this={href ? 'a' : 'section'}
	{href}
	data-slot="card"
	class={cn(
		'block rounded-xl border bg-surface bg-gradient-surface p-4 transition-[border-color,background-color,transform]',
		href &&
			'outline-none hover:-translate-y-px hover:border-border-strong hover:bg-elevated/40 focus-visible:ring-3 focus-visible:ring-ring/50',
		className
	)}
>
	{#if title || actions}
		<header class="mb-3 flex items-start justify-between gap-3">
			<div class="min-w-0">
				{#if title}<h2 class="truncate text-base font-medium">{title}</h2>{/if}
				{#if description}<p class="mt-0.5 text-muted-foreground">{description}</p>{/if}
			</div>
			{#if actions}<div class="flex shrink-0 items-center gap-1">{@render actions()}</div>{/if}
		</header>
	{/if}
	{@render children?.()}
</svelte:element>
