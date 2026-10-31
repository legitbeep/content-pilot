<script lang="ts">
	import { cn, type WithElementRef } from '$lib/shared/lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableRowElement>> = $props();
</script>

<tr
	bind:this={ref}
	data-slot="table-row"
	class={cn(
		'border-b transition-colors last:border-b-0 hover:bg-elevated/60 has-aria-expanded:bg-elevated/60 data-[state=selected]:bg-accent-subtle',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</tr>
