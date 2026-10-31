<script lang="ts">
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
</script>

<PageHeader title="Settings" description="API keys and connected platforms." />
<EmptyState
	icon={KeyRoundIcon}
	text="Add your API keys to start processing videos."
	action={{ label: 'Add keys' }}
/>
