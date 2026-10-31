<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/shared/ui/button';
	import { Input } from '$lib/shared/ui/input';
	import * as Tabs from '$lib/shared/ui/tabs';
	import { platforms, postStatuses } from '$lib/entities/post';
	import { dayKey, filterPosts, shiftMonth, type Filters } from './calendar';
	import MonthView from './month-view.svelte';
	import PostTable from './post-table.svelte';
	import PostDetails from './post-details.svelte';
	import type { CalPost } from './types';

	let { posts }: { posts: CalPost[] } = $props();

	// View, month and filters live in the URL.
	const q = $derived(page.url.searchParams);
	const view = $derived(q.get('view') === 'table' ? 'table' : 'month');
	const month = $derived(q.get('month') ?? dayKey(new Date()).slice(0, 7));
	const filters: Filters = $derived({
		platform: q.get('platform') ?? '',
		status: q.get('status') ?? '',
		from: q.get('from') ?? '',
		to: q.get('to') ?? ''
	});
	const shown = $derived(filterPosts(posts, filters));

	function set(changes: Record<string, string>) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local copy, not reactive state
		const next = new URLSearchParams(page.url.searchParams);
		for (const [k, v] of Object.entries(changes)) {
			if (v) next.set(k, v);
			else next.delete(k);
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path + query string
		goto(`${resolve('/calendar')}?${next}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	let openId = $state<string | null>(null);
	const open = $derived(posts.find((p) => p.id === openId) ?? null);
	const monthLabel = $derived(
		new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric'
		})
	);
	const selectClass =
		'h-8 rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring outline-none';
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center gap-3">
		<Tabs.Root value={view} onValueChange={(v) => set({ view: v === 'table' ? 'table' : '' })}>
			<Tabs.List>
				<Tabs.Trigger value="month">Month</Tabs.Trigger>
				<Tabs.Trigger value="table">Table</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
		<select
			class={selectClass}
			aria-label="Platform"
			value={filters.platform}
			onchange={(e) => set({ platform: e.currentTarget.value })}
		>
			<option value="">All platforms</option>
			{#each platforms as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
		</select>
		<select
			class={selectClass}
			aria-label="Status"
			value={filters.status}
			onchange={(e) => set({ status: e.currentTarget.value })}
		>
			<option value="">All statuses</option>
			{#each postStatuses as s (s)}<option value={s}>{s[0].toUpperCase() + s.slice(1)}</option
				>{/each}
		</select>
		<label class="flex items-center gap-2 text-muted-foreground">
			From
			<Input
				type="date"
				class="h-8 w-auto"
				value={filters.from}
				onchange={(e) => set({ from: e.currentTarget.value })}
			/>
		</label>
		<label class="flex items-center gap-2 text-muted-foreground">
			To
			<Input
				type="date"
				class="h-8 w-auto"
				value={filters.to}
				onchange={(e) => set({ to: e.currentTarget.value })}
			/>
		</label>
		{#if filters.platform || filters.status || filters.from || filters.to}
			<Button
				variant="ghost"
				size="sm"
				onclick={() => set({ platform: '', status: '', from: '', to: '' })}
			>
				Clear filters
			</Button>
		{/if}
	</div>

	{#if view === 'month'}
		<div class="flex items-center gap-2">
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Previous month"
				onclick={() => set({ month: shiftMonth(month, -1) })}
			>
				<ChevronLeftIcon />
			</Button>
			<span class="w-36 text-center font-medium">{monthLabel}</span>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Next month"
				onclick={() => set({ month: shiftMonth(month, 1) })}
			>
				<ChevronRightIcon />
			</Button>
			<Button variant="outline" size="sm" onclick={() => set({ month: '' })}>Today</Button>
		</div>
		<MonthView posts={shown} {month} onopen={(id) => (openId = id)} />
	{:else}
		<PostTable posts={shown} onopen={(id) => (openId = id)} />
	{/if}
</div>

<PostDetails post={open} onclose={() => (openId = null)} />
