<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export type Column<T> = {
		key: keyof T & string;
		label: string;
		sortable?: boolean;
		/** Custom cell; defaults to the raw value. */
		cell?: Snippet<[T]>;
		class?: string;
	};
</script>

<script lang="ts" generics="T extends Record<string, unknown>">
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import * as Table from '$lib/shared/ui/table';

	let {
		columns,
		rows,
		empty,
		onrowclick
	}: {
		columns: Column<T>[];
		rows: T[];
		/** Rendered in place of the body when there are no rows. */
		empty?: Snippet;
		onrowclick?: (row: T) => void;
	} = $props();

	let sort = $state<{ key: string; dir: 'asc' | 'desc' } | null>(null);

	// Click cycles asc → desc → unsorted.
	function toggle(key: string) {
		if (sort?.key !== key) sort = { key, dir: 'asc' };
		else if (sort.dir === 'asc') sort = { key, dir: 'desc' };
		else sort = null;
	}

	const ariaSort = (key: string) =>
		sort?.key !== key ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending';

	const sorted = $derived.by(() => {
		if (!sort) return rows;
		const { key, dir } = sort;
		const sign = dir === 'asc' ? 1 : -1;
		return [...rows].sort((a, b) => {
			const x = a[key] as string | number | null;
			const y = b[key] as string | number | null;
			if (x == null) return 1;
			if (y == null) return -1;
			return (x < y ? -1 : x > y ? 1 : 0) * sign;
		});
	});
</script>

<div class="overflow-hidden rounded-xl border bg-surface">
	<Table.Root>
		<Table.Header>
			<Table.Row class="hover:bg-transparent">
				{#each columns as col (col.key)}
					<Table.Head class={col.class} aria-sort={col.sortable ? ariaSort(col.key) : undefined}>
						{#if col.sortable}
							<button
								type="button"
								class="inline-flex items-center gap-1 hover:text-foreground"
								onclick={() => toggle(col.key)}
							>
								{col.label}
								{#if sort?.key === col.key}
									{#if sort.dir === 'asc'}<ArrowUpIcon class="size-3" />{:else}<ArrowDownIcon
											class="size-3"
										/>{/if}
								{/if}
							</button>
						{:else}
							{col.label}
						{/if}
					</Table.Head>
				{/each}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each sorted as row, i (i)}
				<Table.Row
					class={onrowclick ? 'cursor-pointer' : undefined}
					onclick={onrowclick && (() => onrowclick(row))}
				>
					{#each columns as col (col.key)}
						<Table.Cell class={col.class}>
							{#if col.cell}{@render col.cell(row)}{:else}{row[col.key] ?? ''}{/if}
						</Table.Cell>
					{/each}
				</Table.Row>
			{:else}
				<Table.Row class="hover:bg-transparent">
					<Table.Cell colspan={columns.length} class="h-24 text-center text-muted-foreground">
						{#if empty}{@render empty()}{:else}Nothing here yet.{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
