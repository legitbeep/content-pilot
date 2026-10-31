<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import * as Command from '$lib/shared/ui/command';
	import { nav, type NavRoute } from '$lib/shared/config';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	function run(href: NavRoute['href']) {
		open = false;
		goto(resolve(href));
	}
</script>

<Command.Dialog bind:open title="Command palette" description="Go to a page or run an action">
	<Command.Input placeholder="Type a command or search" />
	<Command.List>
		<Command.Empty>No results.</Command.Empty>
		<Command.Group heading="Actions">
			<!-- ponytail: "New job" lands on the queue until upload exists there. -->
			<Command.Item onSelect={() => run('/queue')}><PlusIcon />New job</Command.Item>
			<Command.Item onSelect={() => run('/settings')}><SettingsIcon />Open settings</Command.Item>
		</Command.Group>
		<Command.Separator />
		<Command.Group heading="Go to">
			{#each nav as route (route.href)}
				<Command.Item value={`Go to ${route.label}`} onSelect={() => run(route.href)}>
					<route.icon />{route.label}
				</Command.Item>
			{/each}
		</Command.Group>
	</Command.List>
</Command.Dialog>
