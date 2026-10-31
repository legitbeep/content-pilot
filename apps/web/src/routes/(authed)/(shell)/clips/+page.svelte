<script lang="ts">
	import { resolve } from '$app/paths';
	import ScissorsIcon from '@lucide/svelte/icons/scissors';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
</script>

<PageHeader
	title="Clip picker"
	description="Review the clips found in a video and pick the ones to edit."
/>
<EmptyState
	icon={ScissorsIcon}
	text="Pick a finished job in the queue to review its clips."
	action={{ label: 'Open queue', href: resolve('/queue') }}
/>
