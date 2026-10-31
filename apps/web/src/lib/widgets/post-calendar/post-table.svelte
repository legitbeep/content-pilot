<script lang="ts">
	import { DataTable, type Column } from '$lib/shared/ui/data-table';
	import { Button } from '$lib/shared/ui/button';
	import { PostStatusBadge, platformName, type PostStatus } from '$lib/entities/post';
	import { postTime } from './calendar';
	import type { CalPost } from './types';

	let { posts, onopen }: { posts: CalPost[]; onopen: (id: string) => void } = $props();

	type Row = {
		id: string;
		preview: string | null;
		title: string;
		platform: string;
		when: string;
		status: PostStatus;
		actions: null;
	};
	const rows: Row[] = $derived(
		posts.map((p) => ({
			id: p.id,
			preview: p.preview,
			title: p.title || 'Untitled',
			platform: platformName(p.platform),
			when: postTime(p).toISOString(),
			status: p.status,
			actions: null
		}))
	);
	const fmt = (iso: string) =>
		new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	const columns: Column<Row>[] = $derived([
		{ key: 'preview', label: '', cell: thumb, class: 'w-12' },
		{ key: 'title', label: 'Title', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		{ key: 'when', label: 'Date and time', sortable: true, cell: when },
		{ key: 'status', label: 'Status', sortable: true, cell: status },
		{ key: 'actions', label: '', cell: actions, class: 'w-28 text-right' }
	]);
</script>

{#snippet thumb(r: Row)}
	{#if r.preview}
		<video
			src={r.preview}
			preload="metadata"
			muted
			class="h-12 w-7 rounded-sm bg-black object-cover"
		></video>
	{:else}
		<div class="h-12 w-7 rounded-sm bg-elevated"></div>
	{/if}
{/snippet}
{#snippet when(r: Row)}{fmt(r.when)}{/snippet}
{#snippet status(r: Row)}<PostStatusBadge status={r.status} />{/snippet}
{#snippet actions(r: Row)}
	<Button variant="ghost" size="sm" onclick={() => onopen(r.id)}>View details</Button>
{/snippet}

<DataTable {columns} {rows} onrowclick={(r) => onopen(r.id)}>
	{#snippet empty()}No posts match these filters.{/snippet}
</DataTable>
