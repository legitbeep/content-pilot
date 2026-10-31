<script lang="ts">
	import { cn, type WithElementRef } from '$lib/shared/lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/** Scrolling middle of a panel dialog (`Dialog.Content size="md|lg|xl"`). */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="dialog-body"
	class={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)}
	{...restProps}
>
	{@render children?.()}
</div>
