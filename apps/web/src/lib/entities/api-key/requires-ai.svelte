<!-- Docs: docs/llm.md
Gate for any AI action. Renders the action disabled, with a tooltip and an "Add a key in Settings"
link, while the user lacks the capability. Reads page.data.ai from the shell layout.
Usage: <RequiresAI need="transcription">{#snippet children({ disabled })}<Button {disabled}>…</Button>{/snippet}</RequiresAI> -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import * as Tooltip from '$lib/shared/ui/tooltip';
	import { MISSING_KEY_MESSAGE, type Capability } from './providers';

	let {
		need,
		children
	}: { need: Capability | Capability[]; children: Snippet<[{ disabled: boolean }]> } = $props();

	const missing = $derived([need].flat().some((c) => !page.data.ai?.[c]));
</script>

{#if missing}
	<span class="inline-flex items-center gap-3">
		<a href={resolve('/settings')} class="text-xs text-muted-foreground underline">
			Add a key in Settings
		</a>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<!-- Disabled buttons get no pointer events; the wrapper carries the tooltip.
					     Keyboard users get the visible Settings link. -->
					<span {...props}>{@render children({ disabled: true })}</span>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{MISSING_KEY_MESSAGE}</Tooltip.Content>
		</Tooltip.Root>
	</span>
{:else}
	{@render children({ disabled: false })}
{/if}
