<script lang="ts">
	import ListVideoIcon from '@lucide/svelte/icons/list-video';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
</script>

<PageHeader title="Queue" description="Long videos being transcribed, checked and clipped." />
<EmptyState
	icon={ListVideoIcon}
	text="No videos yet. Upload a long video to find clips."
	action={{ label: 'Upload video' }}
/>
