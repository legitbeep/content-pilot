<script lang="ts">
	import BrainIcon from '@lucide/svelte/icons/brain';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
</script>

<PageHeader
	title="Brand memory"
	description="Rules you stated and rules learned from your edits."
/>
<EmptyState
	icon={BrainIcon}
	text="No brand rules yet. Finish onboarding to add your first rules."
/>
