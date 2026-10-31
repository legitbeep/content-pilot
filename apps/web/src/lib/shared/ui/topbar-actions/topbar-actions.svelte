<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getTopbarSlot } from './context';

	let { children }: { children: Snippet } = $props();
	const slot = getTopbarSlot();

	// ponytail: actions mount via $effect, so they render after hydration, not in SSR HTML.
	// Move to page data / a route-level snippet map if a flash ever matters.
	$effect(() => {
		if (!slot) return;
		slot.actions = children;
		return () => {
			if (slot.actions === children) slot.actions = undefined;
		};
	});
</script>
