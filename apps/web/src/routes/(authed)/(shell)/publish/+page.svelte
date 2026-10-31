<script lang="ts">
	import { resolve } from '$app/paths';
	import SendIcon from '@lucide/svelte/icons/send';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
</script>

<PageHeader title="Publish" description="Post a rendered clip or schedule it." />
<EmptyState
	icon={SendIcon}
	text="Render a clip in the editor to publish it."
	action={{ label: 'Open queue', href: resolve('/queue') }}
/>
