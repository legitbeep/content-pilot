<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import ScissorsIcon from '@lucide/svelte/icons/scissors';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import FilmIcon from '@lucide/svelte/icons/film';
	import TimerIcon from '@lucide/svelte/icons/timer';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import InfoIcon from '@lucide/svelte/icons/info';
	import { Badge } from '$lib/shared/ui/badge';
	import { Card } from '$lib/shared/ui/card';
	import { Button } from '$lib/shared/ui/button';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { EmptyState } from '$lib/shared/ui/empty-state';
	import { Timecode } from '$lib/shared/ui/timecode';
	import * as Kbd from '$lib/shared/ui/kbd';
	import { formAction } from '$lib/shared/lib/form-action';
	import { isTyping } from '$lib/shared/lib/is-typing';
	import { pickerKeys } from '$lib/shared/config';
	import { cn } from '$lib/shared/lib/utils';
	import { excerpt, REJECT_REASONS, type ClipCandidate } from '$lib/entities/clip';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const usable = $derived(data.clips.filter((c) => c.file_key));
	// Selection starts from the latest approve (or the saved selection after a proceed).
	const selected = new SvelteSet<string>();
	let focusId = $state<string | null>(null);
	let rejecting = $state<string | null>(null);
	let busy = $state(false);
	let video = $state<HTMLVideoElement | null>(null);
	let decisions = $state<typeof data.decisions>({});

	$effect(() => {
		const ids = data.clips
			.filter(
				(c) => (data.decisions[c.id]?.decision ?? (c.selected ? 'approved' : '')) === 'approved'
			)
			.filter((c) => c.file_key)
			.map((c) => c.id);
		const first = data.clips[0]?.id ?? null;
		untrack(() => {
			decisions = { ...data.decisions };
			selected.clear();
			for (const id of ids) selected.add(id);
			focusId = first;
		});
	});

	const focused = $derived(data.clips.find((c) => c.id === focusId) ?? null);
	const offset = (c: ClipCandidate) => c.start_s - (c.file_start_s ?? c.start_s);

	async function feedback(c: ClipCandidate, decision: 'approved' | 'rejected', reason = '') {
		try {
			await formAction('feedback', { clipId: c.id, decision, reason });
			decisions[c.id] = { decision, reason: reason || null };
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not save that.');
		}
	}

	function approve(c: ClipCandidate) {
		if (!c.file_key) return;
		selected.add(c.id);
		rejecting = null;
		void feedback(c, 'approved');
	}

	function reject(c: ClipCandidate, reason: string) {
		selected.delete(c.id);
		rejecting = null;
		void feedback(c, 'rejected', reason);
	}

	/** X / ✓: selecting approves; unselecting just clears it (no feedback row). */
	function toggle(c: ClipCandidate) {
		if (selected.has(c.id)) selected.delete(c.id);
		else approve(c);
	}

	async function proceed() {
		busy = true;
		try {
			const ids = usable.filter((c) => selected.has(c.id)).map((c) => c.id);
			const { clipId } = await formAction<{ clipId: string }>('proceed', { ids });
			await goto(resolve(`/editor/${clipId}`));
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Something went wrong.');
		} finally {
			busy = false;
		}
	}

	// Page-scoped keys from shortcuts.ts (`pickerKeys`): J/K move, X select.
	function onkeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || !data.clips.length) return;
		const i = data.clips.findIndex((c) => c.id === focusId);
		const action = pickerKeys[e.key.toLowerCase()];
		if (action === 'next' || action === 'prev') {
			const next = Math.min(Math.max(i + (action === 'next' ? 1 : -1), 0), data.clips.length - 1);
			focusId = data.clips[next].id;
			document.getElementById(`clip-${focusId}`)?.scrollIntoView({ block: 'nearest' });
		} else if (action === 'select' && focused) toggle(focused);
		else return;
		e.preventDefault();
	}

	const pct = (n: number | null) => (n === null ? '' : String(Math.round(n * 100)));
</script>

<svelte:window {onkeydown} />

<PageHeader
	title={data.job.title ?? 'Clip picker'}
	description={data.job.status === 'done'
		? `${data.clips.length} clips found. Select the ones to edit.`
		: undefined}
>
	{#snippet actions()}
		{#if data.job.status === 'done' && usable.length}
			<Button disabled={busy || !selected.size} onclick={proceed}>
				Proceed with editing{selected.size ? ` (${selected.size})` : ''}
			</Button>
		{/if}
	{/snippet}
</PageHeader>

{#if data.job.status !== 'done'}
	<EmptyState
		icon={ScissorsIcon}
		text="This job isn't finished yet. Its clips show up here once it's done."
		action={{ label: 'Open queue', href: resolve('/queue') }}
	/>
{:else if !data.clips.length}
	<EmptyState
		icon={ScissorsIcon}
		text="No clips were found in this video. Try another video or a more specific request."
		action={{ label: 'Open queue', href: resolve('/queue') }}
	/>
{:else}
	<div class="flex flex-col gap-2 pb-4 text-muted-foreground empty:hidden">
		{#if data.job.user_intent}
			<p class="flex items-start gap-2">
				<SparklesIcon class="mt-0.5 shrink-0 text-accent-text" />
				<span>Your direction for this video: {data.job.user_intent}</span>
			</p>
		{/if}
		{#if data.job.proceeded_at}
			<p class="flex items-start gap-2">
				<InfoIcon class="mt-0.5 shrink-0" />
				<span>You already started editing. Clips you didn't select are deleted after cleanup.</span>
			</p>
		{/if}
	</div>
	<div class="grid gap-6 lg:grid-cols-[1fr_16rem]">
		<ul
			class="grid animate-in-fade content-start gap-4 sm:grid-cols-2"
			aria-label="Clip candidates"
		>
			{#each data.clips as c (c.id)}
				{@const on = selected.has(c.id)}
				{@const d = decisions[c.id]}
				{@const isFocused = c.id === focusId}
				<li id={`clip-${c.id}`}>
					<Card
						class={cn(
							'flex h-full flex-col gap-3 p-3',
							isFocused && 'border-border-strong bg-elevated/40 ring-1 ring-ring/60',
							on && 'border-accent/50',
							!c.file_key && 'opacity-50'
						)}
					>
						<button
							class="flex min-w-0 gap-3 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
							onclick={() => (focusId = c.id)}
							aria-label={`Preview: ${c.hook ?? c.reason}`}
							aria-current={isFocused}
						>
							{#if data.urls[c.id]?.thumb}
								<img
									src={data.urls[c.id].thumb}
									alt=""
									class="aspect-[9/16] w-14 shrink-0 rounded-md border object-cover"
								/>
							{:else}
								<div
									class="flex aspect-[9/16] w-14 shrink-0 items-center justify-center rounded-md border bg-elevated text-muted-foreground"
								>
									<FilmIcon />
								</div>
							{/if}
							<div class="flex min-w-0 flex-col gap-1.5">
								<span class="line-clamp-2 font-medium">{c.hook ?? c.reason}</span>
								<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
									<span class="flex items-center gap-1">
										<TimerIcon class="size-3" /><Timecode seconds={c.end_s - c.start_s} whole />
									</span>
									{#if c.ranking_score !== null}
										<Badge variant="secondary" title="Ranking score"
											>Score <span class="tabular-nums">{pct(c.ranking_score)}</span></Badge
										>
									{/if}
								</div>
								<p class="line-clamp-2 text-xs text-muted-foreground">{excerpt(c)}</p>
							</div>
						</button>
						<div class="flex flex-wrap gap-1">
							{#each c.reasons.length ? c.reasons : [c.reason] as r, i (i)}
								<Badge variant="secondary" class="max-w-full truncate">{r}</Badge>
							{/each}
						</div>
						<div class="mt-auto flex items-center gap-1">
							<Button
								size="sm"
								variant={on ? 'secondary' : 'outline'}
								disabled={!c.file_key}
								aria-pressed={on}
								onclick={() => toggle(c)}
							>
								<CheckIcon class={on ? 'text-success' : undefined} />{on ? 'Selected' : 'Select'}
							</Button>
							<Button
								size="sm"
								variant={d?.decision === 'rejected' ? 'secondary' : 'ghost'}
								aria-expanded={rejecting === c.id}
								onclick={() => (rejecting = rejecting === c.id ? null : c.id)}
								><XIcon />Reject</Button
							>
							{#if d?.decision === 'rejected' && d.reason}
								<span class="ml-auto truncate text-xs text-muted-foreground">{d.reason}</span>
							{/if}
						</div>
						{#if rejecting === c.id}
							<div class="flex flex-wrap gap-1.5" role="group" aria-label="Why reject this clip?">
								{#each REJECT_REASONS as reason (reason)}
									<Button size="xs" variant="outline" onclick={() => reject(c, reason)}
										>{reason}</Button
									>
								{/each}
							</div>
						{/if}
					</Card>
				</li>
			{/each}
		</ul>

		<aside class="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start" aria-label="Preview">
			{#if focused && data.urls[focused.id]?.video}
				{#key focused.id}
					<video
						bind:this={video}
						src={data.urls[focused.id].video}
						class="aspect-[9/16] w-full rounded-xl border bg-black object-contain"
						controls
						playsinline
						onloadedmetadata={() => {
							if (video) video.currentTime = offset(focused);
							void video?.play().catch(() => {});
						}}><track kind="captions" /></video
					>
				{/key}
				{#if focused.description || Object.keys(focused.scores).length}
					<Card title="Why this clip">
						<div class="flex flex-col gap-3">
							{#if focused.description}
								<p class="leading-relaxed text-muted-foreground">{focused.description}</p>
							{/if}
							{#if Object.keys(focused.scores).length}
								<dl class="flex flex-col gap-2 text-xs">
									{#each Object.entries(focused.scores) as [k, v] (k)}
										<div class="flex flex-col gap-1">
											<div class="flex justify-between gap-2">
												<dt class="text-muted-foreground first-letter:uppercase">
													{k.replaceAll('_', ' ')}
												</dt>
												<dd class="tabular-nums">{pct(v)}</dd>
											</div>
											<div class="h-1 overflow-hidden rounded-full bg-elevated" aria-hidden="true">
												<div class="h-full rounded-full bg-info" style:width="{pct(v)}%"></div>
											</div>
										</div>
									{/each}
								</dl>
							{/if}
						</div>
					</Card>
				{/if}
			{:else if focused}
				<p class="text-muted-foreground">This clip's video was deleted.</p>
			{/if}
			<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
				<Kbd.Root>J</Kbd.Root><Kbd.Root>K</Kbd.Root> move · <Kbd.Root>X</Kbd.Root> select
			</p>
		</aside>
	</div>
{/if}
