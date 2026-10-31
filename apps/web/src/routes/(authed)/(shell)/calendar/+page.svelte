<script lang="ts">
	import { resolve } from '$app/paths';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
	import { PostCalendar } from '$lib/widgets/post-calendar';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<PageHeader title="Calendar" description="Scheduled and posted clips." />
{#if data.posts.length}
	<PostCalendar posts={data.posts} />
{:else}
	<EmptyState
		icon={CalendarIcon}
		text="Nothing scheduled. Post or schedule a rendered clip and it shows up here."
		action={{ label: 'Open publish', href: resolve('/publish') }}
	/>
{/if}
