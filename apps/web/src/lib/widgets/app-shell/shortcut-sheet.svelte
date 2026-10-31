<script lang="ts">
	import * as Sheet from '$lib/shared/ui/sheet';
	import * as Kbd from '$lib/shared/ui/kbd';
	import { shortcuts } from '$lib/shared/config';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform);
	const label = (k: string) => (k === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : k);
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="w-80">
		<Sheet.Header>
			<Sheet.Title>Keyboard shortcuts</Sheet.Title>
		</Sheet.Header>
		<ul class="flex flex-col gap-1 px-4">
			{#each shortcuts as s (s.label)}
				<li class="flex items-center justify-between py-1.5">
					<span>{s.label}</span>
					<Kbd.Group>
						{#each s.keys as k, i (i)}<Kbd.Root>{label(k)}</Kbd.Root>{/each}
					</Kbd.Group>
				</li>
			{/each}
		</ul>
	</Sheet.Content>
</Sheet.Root>
