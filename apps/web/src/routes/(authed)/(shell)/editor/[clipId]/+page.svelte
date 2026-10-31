<script lang="ts">
	import { resolve } from '$app/paths';
	import FilmIcon from '@lucide/svelte/icons/film';
	import { Editor } from '$lib/widgets/editor';
	import { EmptyState } from '$lib/shared/ui/empty-state';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#if data.timeline}
	{#key data.clip.id}
		<Editor
			clip={data.clip}
			clips={data.clips}
			timeline={data.timeline.data}
			revision={data.timeline.revision}
			urls={data.urls}
		/>
	{/key}
{:else}
	<EmptyState
		icon={FilmIcon}
		text="This clip's video was deleted, so it can't be edited."
		action={{ label: 'Open queue', href: resolve('/queue') }}
	/>
{/if}
