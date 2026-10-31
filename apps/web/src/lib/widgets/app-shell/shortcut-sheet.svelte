<script lang="ts">
	import * as Dialog from '$lib/shared/ui/dialog';
	import * as Kbd from '$lib/shared/ui/kbd';
	import { shortcuts } from '$lib/shared/config';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform);
	const label = (k: string) => (k === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : k);
</script>

<Dialog.Root bind:open>
	<Dialog.Content size="md">
		<Dialog.Header>
			<Dialog.Title>Keyboard shortcuts</Dialog.Title>
		</Dialog.Header>
		<Dialog.Body>
			<ul class="flex flex-col divide-y">
				{#each shortcuts as s (s.label)}
					<li class="flex items-center justify-between gap-4 py-2">
						<span>{s.label}</span>
						<Kbd.Group>
							{#each s.keys as k, i (i)}<Kbd.Root>{label(k)}</Kbd.Root>{/each}
						</Kbd.Group>
					</li>
				{/each}
			</ul>
		</Dialog.Body>
	</Dialog.Content>
</Dialog.Root>
