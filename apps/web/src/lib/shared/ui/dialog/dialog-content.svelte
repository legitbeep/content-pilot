<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/shared/ui/button/index.js';
	import { cn, type WithoutChildrenOrChild } from '$lib/shared/lib/utils.js';
	import DialogOverlay from './dialog-overlay.svelte';
	import DialogPortal from './dialog-portal.svelte';
	import type { Snippet } from 'svelte';
	import type { ComponentProps } from 'svelte';

	/** sm = compact confirm dialog (padded grid). md/lg/xl = panel: fixed header + footer around a
	 * scrolling `Dialog.Body`, capped at 85% of the viewport height. */
	const sizes = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-3xl' };

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = true,
		size = 'sm',
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
		children: Snippet;
		showCloseButton?: boolean;
		size?: keyof typeof sizes;
	} = $props();
	const panel = $derived(size !== 'sm');
</script>

<DialogPortal {...portalProps}>
	<DialogOverlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		data-panel={panel || undefined}
		class={cn(
			'group/dialog fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%_-_2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover text-sm text-popover-foreground shadow-overlay ring-1 ring-foreground/10 duration-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
			panel ? 'flex max-h-[85svh] flex-col overflow-hidden' : 'grid gap-4 p-5',
			sizes[size],
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close data-slot="dialog-close">
				{#snippet child({ props })}
					<Button
						variant="ghost"
						class={cn('absolute', panel ? 'top-3.5 right-3.5' : 'top-2 right-2')}
						size="icon-sm"
						{...props}
					>
						<XIcon />
						<span class="sr-only">Close</span>
					</Button>
				{/snippet}
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPortal>
