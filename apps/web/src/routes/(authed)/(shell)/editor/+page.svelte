<script lang="ts">
	import { resolve } from '$app/paths';
	import FilmIcon from '@lucide/svelte/icons/film';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
</script>

<PageHeader title="Editor" description="Trim, caption and reframe a clip." />
<EmptyState
	icon={FilmIcon}
	text="Open a clip from the clip picker to edit it."
	action={{ label: 'Open queue', href: resolve('/queue') }}
/>
