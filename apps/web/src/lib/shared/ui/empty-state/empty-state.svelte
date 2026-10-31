<script lang="ts">
	import type { Component } from 'svelte';
	import * as Empty from '$lib/shared/ui/empty';
	import { Button } from '$lib/shared/ui/button';

	let {
		icon: Icon,
		text,
		action
	}: {
		icon: Component;
		text: string;
		/** At most one action; it is the view's primary button. */
		action?: { label: string; href?: string; onclick?: () => void };
	} = $props();
</script>

<Empty.Root class="border border-dashed">
	<Empty.Header>
		<Empty.Media variant="icon"><Icon /></Empty.Media>
		<Empty.Description>{text}</Empty.Description>
	</Empty.Header>
	{#if action}
		<Empty.Content>
			<Button href={action.href} onclick={action.onclick}>{action.label}</Button>
		</Empty.Content>
	{/if}
</Empty.Root>
