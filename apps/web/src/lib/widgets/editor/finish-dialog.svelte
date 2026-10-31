<script lang="ts">
	// "Finish all clips" summary: polls the session's render status, previews finished renders.
	import { resolve } from '$app/paths';
	import * as Dialog from '$lib/shared/ui/dialog';
	import { Button } from '$lib/shared/ui/button';
	import { StatusBadge } from '$lib/shared/ui/status-badge';
	import { renderBadge } from './render-badge';

	type Render = {
		id: string;
		reason: string;
		status: string | null;
		error: string | null;
		url: string | null;
	};
	let { open = $bindable(false), clipId }: { open?: boolean; clipId: string } = $props();

	let renders: Render[] = $state([]);
	const busy = $derived(renders.some((r) => r.status === 'queued' || r.status === 'rendering'));
	const done = $derived(renders.filter((r) => r.status === 'done').length);

	$effect(() => {
		if (!open) return;
		let stop = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			const res = await fetch(resolve(`/editor/${clipId}/renders`));
			if (res.ok) renders = await res.json();
			if (!stop && (busy || !renders.length)) timer = setTimeout(poll, 3000);
		};
		poll();
		return () => {
			stop = true;
			clearTimeout(timer);
		};
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[85svh] overflow-y-auto sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>Finish all clips</Dialog.Title>
			<Dialog.Description>
				{!renders.length
					? 'Loading renders…'
					: busy
						? `Rendering… ${done} of ${renders.length} done. You can keep editing; this updates on its own.`
						: `${done} of ${renders.length} clips rendered.`}
			</Dialog.Description>
		</Dialog.Header>
		<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
			{#each renders as r (r.id)}
				{@const badge = renderBadge(r.status)}
				<li class="flex flex-col gap-2 rounded-lg border bg-surface p-2">
					{#if r.url}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							src={r.url}
							controls
							class="aspect-[9/16] w-full rounded-sm bg-black object-contain"
						></video>
					{:else}
						<div
							class="flex aspect-[9/16] w-full items-center justify-center rounded-sm bg-elevated text-xs text-muted-foreground"
						>
							{r.error ?? 'No render yet'}
						</div>
					{/if}
					<div class="flex items-center justify-between gap-2">
						<span class="truncate text-xs">{r.reason}</span>
						{#if badge}<StatusBadge status={badge} />{/if}
					</div>
				</li>
			{/each}
		</ul>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Keep editing</Button>
			{#if done}
				<Button href={resolve('/publish')}>Go to publish</Button>
			{:else}
				<Button disabled>Go to publish</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
