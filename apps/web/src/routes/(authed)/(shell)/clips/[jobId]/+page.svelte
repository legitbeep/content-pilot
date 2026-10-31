<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import ScissorsIcon from '@lucide/svelte/icons/scissors';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
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
	{#if data.job.user_intent}
		<p class="mb-3 text-muted-foreground">Your direction for this video: {data.job.user_intent}</p>
	{/if}
	{#if data.job.proceeded_at}
		<p class="mb-3 text-muted-foreground">
			You already started editing. Clips you didn't select are deleted after cleanup.
		</p>
	{/if}
	<div class="grid gap-6 lg:grid-cols-[1fr_16rem]">
		<ul class="flex flex-col divide-y rounded-lg border">
			{#each data.clips as c (c.id)}
				{@const on = selected.has(c.id)}
				{@const d = decisions[c.id]}
				<li
					id={`clip-${c.id}`}
					class={cn(
						'flex flex-col gap-2 p-3',
						c.id === focusId ? 'bg-elevated' : 'hover:bg-elevated/60',
						!c.file_key && 'opacity-50'
					)}
				>
					<div class="flex gap-3">
						<button
							class="flex min-w-0 flex-1 gap-3 text-left"
							onclick={() => (focusId = c.id)}
							aria-label={`Preview: ${c.hook ?? c.reason}`}
						>
							{#if data.urls[c.id]?.thumb}
								<img
									src={data.urls[c.id].thumb}
									alt=""
									class="h-20 w-14 shrink-0 rounded-sm border object-cover"
								/>
							{:else}
								<div class="h-20 w-14 shrink-0 rounded-sm border bg-surface"></div>
							{/if}
							<div class="flex min-w-0 flex-col gap-1">
								<div class="flex items-baseline gap-2">
									<span class="font-medium">{c.hook ?? c.reason}</span>
								</div>
								<div class="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
									<Timecode seconds={c.end_s - c.start_s} />
									{#each c.reasons.length ? c.reasons : [c.reason] as r, i (i)}
										<span>· {r}</span>
									{/each}
								</div>
								<p class="line-clamp-2 text-xs text-muted-foreground">{excerpt(c)}</p>
							</div>
						</button>
						<div class="flex shrink-0 flex-col items-end justify-between gap-2">
							{#if c.ranking_score !== null}
								<span class="text-xs text-muted-foreground" title="Ranking score">
									Score: <span class="font-mono">{pct(c.ranking_score)}/100</span>
								</span>
							{/if}
							<div class="flex gap-1">
								<Button
									size="icon-sm"
									variant={on ? 'secondary' : 'ghost'}
									disabled={!c.file_key}
									aria-label={on ? 'Unselect clip' : 'Select clip'}
									aria-pressed={on}
									onclick={() => toggle(c)}><CheckIcon /></Button
								>
								<Button
									size="icon-sm"
									variant={d?.decision === 'rejected' ? 'secondary' : 'ghost'}
									aria-label="Reject"
									title={d?.decision === 'rejected' && d.reason ? d.reason : 'Reject'}
									onclick={() => (rejecting = rejecting === c.id ? null : c.id)}><XIcon /></Button
								>
							</div>
						</div>
					</div>
					{#if rejecting === c.id}
						<div class="flex flex-wrap gap-1.5">
							{#each REJECT_REASONS as reason (reason)}
								<Button size="xs" variant="outline" onclick={() => reject(c, reason)}
									>{reason}</Button
								>
							{/each}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		<aside class="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
			{#if focused && data.urls[focused.id]?.video}
				{#key focused.id}
					<video
						bind:this={video}
						src={data.urls[focused.id].video}
						class="aspect-[9/16] w-full rounded-lg border bg-black object-contain"
						controls
						playsinline
						onloadedmetadata={() => {
							if (video) video.currentTime = offset(focused);
							void video?.play().catch(() => {});
						}}><track kind="captions" /></video
					>
				{/key}
				{#if focused.description}
					<div class="flex flex-col gap-1">
						<h3 class="text-sm font-medium">Summary</h3>
						<p class="text-muted-foreground">{focused.description}</p>
					</div>
				{/if}
				{#if Object.keys(focused.scores).length}
					<dl class="grid grid-cols-[1fr_auto] gap-y-0.5 text-xs text-muted-foreground">
						{#each Object.entries(focused.scores) as [k, v] (k)}
							<dt>{k.replace('_', ' ')}</dt>
							<dd class="font-mono">{pct(v)}</dd>
						{/each}
					</dl>
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
