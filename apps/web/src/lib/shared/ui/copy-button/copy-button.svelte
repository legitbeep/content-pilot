<script lang="ts">
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/shared/ui/button';

	let {
		value,
		label = 'Copy',
		class: className
	}: {
		value: string;
		/** Accessible name and tooltip, e.g. "Copy job ID". */
		label?: string;
		class?: string;
	} = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy(e: MouseEvent) {
		e.stopPropagation(); // safe inside clickable rows/cards
		e.preventDefault();
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			toast.error('Could not copy');
			return;
		}
		copied = true;
		toast('Copied');
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 1500);
	}
</script>

<Button
	variant="ghost"
	size="icon-xs"
	aria-label={label}
	title={label}
	class={className}
	onclick={copy}
>
	{#if copied}<CheckIcon class="text-success" />{:else}<CopyIcon />{/if}
</Button>
