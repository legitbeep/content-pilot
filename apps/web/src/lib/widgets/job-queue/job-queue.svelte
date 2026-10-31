<script lang="ts">
	import FilmIcon from '@lucide/svelte/icons/film';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import SquareIcon from '@lucide/svelte/icons/square';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import ListRestartIcon from '@lucide/svelte/icons/list-restart';
	import MessageCircleQuestionIcon from '@lucide/svelte/icons/message-circle-question-mark';
	import ScissorsIcon from '@lucide/svelte/icons/scissors';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/shared/ui/button';
	import { CopyButton } from '$lib/shared/ui/copy-button';
	import * as Dialog from '$lib/shared/ui/dialog';
	import * as Kbd from '$lib/shared/ui/kbd';
	import { StatusBadge } from '$lib/shared/ui/status-badge';
	import { Timecode } from '$lib/shared/ui/timecode';
	import { queueKeys } from '$lib/shared/config';
	import { formAction } from '$lib/shared/lib/form-action';
	import { isTyping } from '$lib/shared/lib/is-typing';
	import { cn } from '$lib/shared/lib/utils';
	import { can, stepLabels, UPLOAD_LIMITS, type Job } from '$lib/entities/job';
	import JobDetails from './job-details.svelte';
	import { timeAgo } from './format';

	let { jobs }: { jobs: Job[] } = $props();

	let selected = $state(0);
	let openId = $state<string | null>(null);
	let confirmDelete = $state<Job | null>(null);
	let dragId = $state<string | null>(null);
	let order = $state<string[] | null>(null); // optimistic pending order while dragging/saving

	// Mirrors the worker's claim rule so pending rows say why they wait.
	const processingFull = $derived(
		jobs.filter((j) => j.status === 'processing').length >= UPLOAD_LIMITS.processingPerUser
	);
	const rows = $derived.by(() => {
		if (!order) return jobs;
		const byId = new Map(jobs.map((j) => [j.id, j]));
		const pending = order.map((id) => byId.get(id)).filter((j): j is Job => !!j);
		return [...pending, ...jobs.filter((j) => j.status !== 'pending')];
	});
	const openJob = $derived(jobs.find((j) => j.id === openId) ?? null);

	async function run(name: string, job: Job, fields: Record<string, string> = {}) {
		try {
			await formAction(name, { id: job.id, ...fields });
			await invalidate('app:jobs');
			return true;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Something went wrong.');
			return false;
		}
	}

	async function drop(targetId: string) {
		if (!dragId || dragId === targetId) return;
		const ids = rows.filter((j) => j.status === 'pending').map((j) => j.id);
		ids.splice(ids.indexOf(targetId), 0, ...ids.splice(ids.indexOf(dragId), 1));
		order = ids;
		dragId = null;
		try {
			await formAction('reorder', { ids });
			await invalidate('app:jobs');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not reorder.');
		}
		order = null;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || openId || confirmDelete) return;
		const action = queueKeys[e.key.toLowerCase()];
		if (!action || !rows.length) return;
		e.preventDefault();
		const job = rows[Math.min(selected, rows.length - 1)];
		if (action === 'next') selected = Math.min(selected + 1, rows.length - 1);
		else if (action === 'prev') selected = Math.max(selected - 1, 0);
		else if (action === 'open') openId = job.id;
		else if (action === 'delete' && can(job.status, 'delete')) confirmDelete = job;
	}

	$effect(() => {
		document.getElementById(`job-${rows[selected]?.id}`)?.scrollIntoView({ block: 'nearest' });
	});
</script>

<svelte:window {onkeydown} />

<div class="flex flex-col gap-2">
	<ul
		class="animate-in-fade divide-y overflow-hidden rounded-xl border bg-surface bg-gradient-surface"
		aria-label="Jobs"
		role="listbox"
	>
		{#each rows as job, i (job.id)}
			{@const pending = job.status === 'pending'}
			{@const duration = job.media?.duration_s ?? job.duration_s}
			<li
				id="job-{job.id}"
				class={cn(
					'group relative flex min-h-16 cursor-default items-center gap-3 px-3 py-2.5 transition-colors hover:bg-elevated/60',
					i === selected && 'bg-elevated',
					dragId === job.id && 'opacity-50'
				)}
				draggable={pending}
				ondragstart={() => (dragId = job.id)}
				ondragend={() => (dragId = null)}
				ondragover={(e) => pending && dragId && e.preventDefault()}
				ondrop={() => drop(job.id)}
				onclick={(e) => {
					selected = i;
					// Row buttons (stop, retry, copy, delete…) act on their own; anywhere else opens details.
					if (!(e.target as HTMLElement).closest('button, a')) openId = job.id;
				}}
				onkeydown={() => {}}
				role="option"
				tabindex="-1"
				aria-selected={i === selected}
			>
				{#if i === selected}
					<span class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true"
					></span>
				{/if}
				<GripVerticalIcon
					class={cn('size-4 shrink-0 text-muted-foreground', pending ? 'cursor-grab' : 'invisible')}
				/>
				<div
					class="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-elevated text-muted-foreground"
				>
					<FilmIcon />
				</div>

				<div class="flex min-w-0 flex-1 flex-col gap-1">
					<div class="flex min-w-0 items-center gap-1">
						<span class="truncate font-medium">{job.title ?? 'Untitled video'}</span>
						<CopyButton
							value={job.id}
							label="Copy job ID"
							class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
						/>
					</div>
					<div class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
						{#if job.status === 'processing'}
							<span class="shrink-0">
								{job.stop_requested
									? 'Stopping…'
									: (stepLabels[job.current_step ?? ''] ?? 'Starting')}
							</span>
							<span
								class="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-elevated"
								role="progressbar"
								aria-label="Progress"
								aria-valuenow={job.progress}
								aria-valuemin={0}
								aria-valuemax={100}
							>
								<span
									class="block h-full rounded-full bg-info transition-[width]"
									style:width="{job.progress}%"
								></span>
							</span>
							<span class="tabular-nums">{job.progress}%</span>
						{:else if pending && processingFull}
							<span class="truncate">
								Waits until one of your {UPLOAD_LIMITS.processingPerUser} processing videos finishes
							</span>
						{:else if job.status === 'done' && job.clip_count}
							<span class="flex shrink-0 items-center gap-1 text-foreground">
								<ScissorsIcon class="size-3 text-muted-foreground" />
								{job.clip_count}
								{job.clip_count === 1 ? 'clip' : 'clips'}
							</span>
							{#if job.request}<span class="truncate">· {job.request}</span>{/if}
						{:else if job.status === 'failed' && job.error}
							<span class="truncate text-danger">{job.error}</span>
						{:else if job.request}
							<span class="truncate">{job.request}</span>
						{/if}
					</div>
				</div>

				<span class="hidden w-14 shrink-0 text-right text-muted-foreground sm:block">
					{#if duration}<Timecode seconds={duration} whole />{/if}
				</span>
				<span class="hidden w-24 shrink-0 text-right text-xs text-muted-foreground md:block">
					{timeAgo(job.created_at)}
				</span>
				<span class="w-24 shrink-0" aria-live="polite"><StatusBadge status={job.status} /></span>
				<!-- Phones: actions live in the details sheet (tap the row). -->
				<div class="hidden w-32 shrink-0 justify-end gap-1 sm:flex">
					{#if can(job.status, 'stop')}
						<Button
							size="xs"
							variant="outline"
							disabled={job.stop_requested}
							onclick={() => run('stop', job)}><SquareIcon />Stop</Button
						>
					{:else if can(job.status, 'retry')}
						<Button size="xs" variant="outline" onclick={() => run('retry', job)}
							><RotateCcwIcon />Retry</Button
						>
					{:else if can(job.status, 'requeue')}
						<Button size="xs" variant="outline" onclick={() => run('requeue', job)}
							><ListRestartIcon />Re-queue</Button
						>
					{:else if can(job.status, 'answer')}
						<Button size="xs" variant="outline" onclick={() => (openId = job.id)}
							><MessageCircleQuestionIcon />Answer</Button
						>
					{:else if can(job.status, 'open_clips')}
						<Button size="xs" variant="outline" href={resolve(`/clips/${job.id}`)}
							><ScissorsIcon />Clips</Button
						>
					{/if}
					{#if can(job.status, 'delete')}
						<Button
							size="icon-xs"
							variant="ghost"
							aria-label="Delete job"
							title="Delete job"
							onclick={() => (confirmDelete = job)}><TrashIcon /></Button
						>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
	<p class="hidden items-center gap-1.5 self-end text-xs text-muted-foreground sm:flex">
		<Kbd.Root>J</Kbd.Root><Kbd.Root>K</Kbd.Root> move · <Kbd.Root>Enter</Kbd.Root> details ·
		<Kbd.Root>⌫</Kbd.Root> delete
	</p>
</div>

<JobDetails
	job={openJob}
	onclose={() => (openId = null)}
	{run}
	ondelete={(j) => (confirmDelete = j)}
/>

<Dialog.Root open={!!confirmDelete} onOpenChange={(o) => !o && (confirmDelete = null)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete this job?</Dialog.Title>
			<Dialog.Description>
				“{confirmDelete?.title ?? 'Untitled video'}” and its uploaded video will be deleted. This
				can't be undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (confirmDelete = null)}>Cancel</Button>
			<Button
				variant="destructive"
				onclick={async () => {
					const job = confirmDelete!;
					confirmDelete = null;
					if (openId === job.id) openId = null;
					if (await run('delete', job)) toast('Job deleted');
				}}><TrashIcon />Delete</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
