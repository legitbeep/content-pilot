<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import SearchIcon from '@lucide/svelte/icons/search';
	import * as Breadcrumb from '$lib/shared/ui/breadcrumb';
	import * as Sidebar from '$lib/shared/ui/sidebar';
	import * as Kbd from '$lib/shared/ui/kbd';
	import { Button } from '$lib/shared/ui/button';
	import { Separator } from '$lib/shared/ui/separator';
	import { crumbsFor } from '$lib/shared/config';
	import type { TopbarSlot } from '$lib/shared/ui/topbar-actions';

	let { topbar, onpalette }: { topbar: TopbarSlot; onpalette: () => void } = $props();
	const crumbs = $derived(crumbsFor(page.url.pathname));
</script>

<header class="flex h-12 shrink-0 items-center gap-2 border-b px-3">
	<Sidebar.Trigger class="text-muted-foreground" />
	<Separator orientation="vertical" class="mr-1 data-vertical:h-4 data-vertical:self-center" />
	<Breadcrumb.Root>
		<Breadcrumb.List>
			{#each crumbs as c, i (c.href)}
				{#if i > 0}<Breadcrumb.Separator />{/if}
				<Breadcrumb.Item>
					{#if i < crumbs.length - 1}
						<Breadcrumb.Link href={resolve(c.href)}>{c.label}</Breadcrumb.Link>
					{:else}
						<Breadcrumb.Page>{c.label}</Breadcrumb.Page>
					{/if}
				</Breadcrumb.Item>
			{/each}
		</Breadcrumb.List>
	</Breadcrumb.Root>
	<div class="ml-auto flex items-center gap-2">
		{@render topbar.actions?.()}
		<Button variant="ghost" size="sm" class="text-muted-foreground" onclick={onpalette}>
			<SearchIcon />Search<Kbd.Root>⌘K</Kbd.Root>
		</Button>
	</div>
</header>
