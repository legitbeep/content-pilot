<script lang="ts">
	// Editor icon button: ghost icon Button + a tooltip with its label and, for an editor
	// shortcut action, the keys (read from shortcuts.ts so hints never drift).
	import type { Snippet } from 'svelte';
	import { shortcuts, type EditorAction } from '$lib/shared/config';
	import { Button, type ButtonSize } from '$lib/shared/ui/button';
	import * as Kbd from '$lib/shared/ui/kbd';
	import * as Tooltip from '$lib/shared/ui/tooltip';

	let {
		label,
		action,
		onclick,
		disabled = false,
		pressed,
		size = 'icon-sm',
		class: className,
		children
	}: {
		label: string;
		action?: EditorAction;
		onclick: () => void;
		disabled?: boolean;
		pressed?: boolean;
		size?: ButtonSize;
		class?: string;
		children: Snippet;
	} = $props();

	const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform);
	const name = (k: string) => (k === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : k === 'Shift' ? '⇧' : k);
	const keys = $derived(
		action &&
			shortcuts.find((s) => 'page' in s && s.page === '/editor' && s.action === action)?.keys
	);
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{size}
				variant="ghost"
				{disabled}
				aria-label={label}
				aria-pressed={pressed}
				class={className}
				{onclick}
			>
				{@render children()}
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>
		{label}
		{#if keys}
			<Kbd.Group
				>{#each keys as k, i (i)}<Kbd.Root>{name(k)}</Kbd.Root>{/each}</Kbd.Group
			>
		{/if}
	</Tooltip.Content>
</Tooltip.Root>
