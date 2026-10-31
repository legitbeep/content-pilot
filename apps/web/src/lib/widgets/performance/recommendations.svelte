<!-- Docs: docs/performance.md
Home section: saved long-form recommendations (from brand memory), a centered "Get recommendations"
card when none were fetched yet, "Get new recommendations" to replace the saved batch. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import CompassIcon from '@lucide/svelte/icons/compass';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { Button } from '$lib/shared/ui/button';
	import { Badge } from '$lib/shared/ui/badge';
	import { Card } from '$lib/shared/ui/card';
	import { Skeleton } from '$lib/shared/ui/skeleton';
	import { RequiresAI } from '$lib/entities/api-key';
	import { formAction } from '$lib/shared/lib/form-action';

	type Rec = {
		videoId: string;
		title: string;
		channel: string;
		license: string;
		reason: string;
		url: string;
		thumbnail?: string | null;
	};
	type Batch = { items: Rec[]; created_at: string };
	let { youtubeConnected, saved }: { youtubeConnected: boolean; saved: Batch | null } = $props();

	// Writable derived: follows the loaded batch, replaced locally after a fetch.
	let batch = $derived(saved);
	let busy = $state(false);
	let error = $state('');

	async function fetchRecs() {
		busy = true;
		error = '';
		try {
			batch = (await formAction<{ recommendations: Batch }>('recommend', {})).recommendations;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not get recommendations.';
			toast.error(error);
		} finally {
			busy = false;
		}
	}
	const when = (iso: string) =>
		new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
</script>

{#snippet getButton(label: string, variant: 'outline' | 'secondary')}
	<RequiresAI need="llm">
		{#snippet children({ disabled })}
			<Button {variant} onclick={fetchRecs} disabled={disabled || busy || !youtubeConnected}>
				{#if busy}<LoaderCircleIcon class="animate-spin" />{:else}<RefreshCwIcon />{/if}
				{busy ? 'Finding videos…' : label}
			</Button>
		{/snippet}
	</RequiresAI>
{/snippet}

<section class="flex flex-col gap-3" aria-labelledby="recs-title" aria-busy={busy}>
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 id="recs-title" class="text-base font-medium">Recommended long-form videos</h2>
			<p class="mt-0.5 text-muted-foreground">
				Creative Commons videos picked from your brand memory{batch
					? ` · updated ${when(batch.created_at)}`
					: ''}.
			</p>
		</div>
		{#if batch}{@render getButton('Get new recommendations', 'outline')}{/if}
	</div>

	{#if error}<p class="text-destructive" role="alert">{error}</p>{/if}

	{#if busy}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
			{#each [0, 1, 2, 3] as i (i)}
				<div class="flex flex-col gap-2">
					<Skeleton class="aspect-video rounded-xl" />
					<Skeleton class="h-4 w-3/4" />
					<Skeleton class="h-3 w-1/2" />
				</div>
			{/each}
		</div>
	{:else if batch?.items.length}
		<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each batch.items as r, i (r.videoId)}
				<li class="animate-in-fade" style:animation-delay="{i * 50}ms">
					<Card class="flex h-full flex-col gap-3 overflow-hidden p-0">
						<div class="aspect-video bg-elevated">
							{#if r.thumbnail}
								<img src={r.thumbnail} alt="" loading="lazy" class="size-full object-cover" />
							{:else}
								<span class="flex size-full items-center justify-center text-muted-foreground">
									<CompassIcon class="size-6" />
								</span>
							{/if}
						</div>
						<div class="flex flex-1 flex-col gap-2 px-4 pb-4">
							<span class="line-clamp-2 font-medium">{r.title}</span>
							<span class="truncate text-xs text-muted-foreground">{r.channel}</span>
							<span class="flex flex-wrap gap-1.5">
								<!-- search uses videoDuration=long: YouTube's "over 20 minutes" -->
								<Badge variant="outline">20+ min</Badge>
								<Badge variant="secondary">{r.license}</Badge>
							</span>
							<p class="line-clamp-3 text-muted-foreground">{r.reason}</p>
							<Button
								variant="ghost"
								size="sm"
								href={r.url}
								target="_blank"
								rel="noreferrer"
								class="mt-auto -ml-2 self-start"
							>
								<ExternalLinkIcon /> Open on YouTube
							</Button>
						</div>
					</Card>
				</li>
			{/each}
		</ul>
	{:else}
		<Card class="flex animate-in-fade flex-col items-center gap-3 px-6 py-10 text-center">
			<span
				class="flex size-10 items-center justify-center rounded-lg border border-border-strong bg-elevated text-accent-text"
			>
				<CompassIcon class="size-5" />
			</span>
			{#if !youtubeConnected}
				<p class="text-muted-foreground">
					Connect YouTube to find long videos worth clipping.
					<a
						href={resolve('/settings')}
						class="rounded-sm text-accent-text underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
						>Open Settings</a
					>
				</p>
			{:else if batch}
				<p class="text-muted-foreground">
					No Creative Commons long videos found. Add core topics in Brand memory and try again.
				</p>
			{:else}
				<p class="text-muted-foreground">
					Find long videos on your topics to cut clips from, picked using your brand memory.
				</p>
				{@render getButton('Get recommendations', 'secondary')}
			{/if}
		</Card>
	{/if}
</section>
