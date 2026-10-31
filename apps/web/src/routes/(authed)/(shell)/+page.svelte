<script lang="ts">
	import { resolve } from '$app/paths';
	import HouseIcon from '@lucide/svelte/icons/house';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
</script>

<PageHeader title="Home" description="Your clips, how they performed, and what to make next." />
<EmptyState
	icon={HouseIcon}
	text="Nothing posted yet. Generate clips from a long video to get started."
	action={{ label: 'Generate clips', href: resolve('/queue') }}
/>
