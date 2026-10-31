<script lang="ts">
	import type { Component } from 'svelte';
	import * as Empty from '$lib/shared/ui/empty';
	import { Button } from '$lib/shared/ui/button';
	import { cn } from '$lib/shared/lib/utils';

	let {
		icon: Icon,
		text,
		action,
		backdrop = true
	}: {
		icon: Component;
		text: string;
		/** At most one action; it is the view's primary button. */
		action?: { label: string; href?: string; onclick?: () => void };
		/** Set false when the view already has a `bg-abstract` (one per view). */
		backdrop?: boolean;
	} = $props();
</script>

<Empty.Root
	class={cn(
		'relative animate-in-fade overflow-hidden rounded-xl border border-dashed py-12',
		backdrop && 'bg-abstract'
	)}
>
	<Empty.Header>
		<Empty.Media
			variant="icon"
			class="size-10 rounded-lg border border-border-strong bg-elevated text-accent-text"
			><Icon /></Empty.Media
		>
		<Empty.Description class="max-w-sm">{text}</Empty.Description>
	</Empty.Header>
	{#if action}
		<Empty.Content>
			<Button href={action.href} onclick={action.onclick}>{action.label}</Button>
		</Empty.Content>
	{/if}
</Empty.Root>
