<script lang="ts">
	import { cn, type WithElementRef } from '$lib/shared/lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="dialog-header"
	class={cn(
		'flex flex-col gap-2 group-data-panel/dialog:shrink-0 group-data-panel/dialog:border-b group-data-panel/dialog:py-4 group-data-panel/dialog:pr-14 group-data-panel/dialog:pl-5',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
