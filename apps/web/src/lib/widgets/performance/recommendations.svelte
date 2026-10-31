<script lang="ts">
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import * as Sheet from '$lib/shared/ui/sheet';
	import { Button } from '$lib/shared/ui/button';
	import { Input } from '$lib/shared/ui/input';
	import { Label } from '$lib/shared/ui/label';
	import { RequiresAI } from '$lib/entities/api-key';
	import { formAction } from '$lib/shared/lib/form-action';

	type Rec = {
		videoId: string;
		title: string;
		channel: string;
		license: string;
		reason: string;
		url: string;
	};
	let { youtubeConnected }: { youtubeConnected: boolean } = $props();
	let open = $state(false);
	let region = $state('');
	let busy = $state(false);
	let results = $state<Rec[] | null>(null);

	async function find() {
		busy = true;
		try {
			const r = await formAction<{ recommendations: Rec[] }>('recommend', { region });
			results = r.recommendations;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not get recommendations.');
		} finally {
			busy = false;
		}
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" {...props}>Recommended long-form videos</Button>
		{/snippet}
	</Sheet.Trigger>
	<Sheet.Content class="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg">
		<Sheet.Header>
			<Sheet.Title>Recommended long-form videos</Sheet.Title>
			<Sheet.Description>
				Creative Commons videos on your core topics to cut clips from. Download one yourself, then
				upload it in the Queue.
			</Sheet.Description>
		</Sheet.Header>
		<div class="flex flex-col gap-4 px-4 pb-4">
			{#if !youtubeConnected}
				<p class="text-muted-foreground">
					Connect YouTube to search it.
					<a href={resolve('/settings')} class="underline">Open Settings</a>
				</p>
			{:else}
				<div class="flex items-end gap-2">
					<div class="flex flex-col gap-1.5">
						<Label for="rec-region">Region (optional)</Label>
						<Input
							id="rec-region"
							bind:value={region}
							placeholder="e.g. IN, US"
							maxlength={2}
							class="w-28 uppercase"
						/>
					</div>
					<RequiresAI need="llm">
						{#snippet children({ disabled })}
							<Button onclick={find} disabled={disabled || busy}>
								{busy ? 'Searching…' : 'Find videos'}
							</Button>
						{/snippet}
					</RequiresAI>
				</div>
			{/if}
			{#if results}
				{#if results.length}
					<ul class="flex flex-col gap-3">
						{#each results as r (r.videoId)}
							<li class="flex flex-col gap-1 rounded-lg border p-3">
								<span class="font-medium">{r.title}</span>
								<span class="text-xs text-muted-foreground">{r.channel} · {r.license}</span>
								<p class="text-muted-foreground">{r.reason}</p>
								<div>
									<Button variant="ghost" size="sm" href={r.url} target="_blank" rel="noreferrer">
										<ExternalLinkIcon /> Open on YouTube
									</Button>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-muted-foreground">
						No Creative Commons long videos found. Add core topics in Brand memory and try again.
					</p>
				{/if}
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
