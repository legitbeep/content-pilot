<script lang="ts">
	import { resolve } from '$app/paths';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
</script>

<PageHeader title="Calendar" description="Scheduled and posted clips." />
<EmptyState
	icon={CalendarIcon}
	text="Nothing scheduled. Scheduled and posted clips show up here."
	action={{ label: 'Open queue', href: resolve('/queue') }}
/>
