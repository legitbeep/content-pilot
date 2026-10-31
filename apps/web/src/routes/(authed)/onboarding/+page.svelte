<script lang="ts">
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
</script>

<main class="mx-auto w-full max-w-2xl px-6 py-16">
	<PageHeader title="Set up your brand" description="A few questions so clips sound like you." />
	<EmptyState icon={SparklesIcon} text="Brand questions and example posts will go here." />
</main>
