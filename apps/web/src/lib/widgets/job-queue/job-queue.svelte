<script lang="ts">
	import FilmIcon from '@lucide/svelte/icons/film';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/shared/ui/button';
	import * as Dialog from '$lib/shared/ui/dialog';
	import { StatusBadge } from '$lib/shared/ui/status-badge';
	import { Timecode } from '$lib/shared/ui/timecode';
	import { queueKeys } from '$lib/shared/config';
	import { formAction } from '$lib/shared/lib/form-action';
	import { isTyping } from '$lib/shared/lib/is-typing';
	import { cn } from '$lib/shared/lib/utils';
	import { can, stepLabels, type Job } from '$lib/entities/job';
	import JobDetails from './job-details.svelte';
	import { timeAgo } from './format';

	let { jobs }: { jobs: Job[] } = $props();

	let selected = $state(0);
	let openId = $state<string | null>(null);
	let confirmDelete = $state<Job | null>(null);
	let dragId = $state<string | null>(null);
	let order = $state<string[] | null>(null); // optimistic pending order while dragging/saving

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

<ul class="divide-y rounded-lg border" aria-label="Jobs" role="listbox">
	{#each rows as job, i (job.id)}
		{@const pending = job.status === 'pending'}
		<li
			id="job-{job.id}"
			class={cn(
				'group flex h-12 cursor-default items-center gap-3 px-3 hover:bg-elevated',
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
				// Row buttons (stop, retry, delete…) act on their own; anywhere else opens details.
				if (!(e.target as HTMLElement).closest('button, a')) openId = job.id;
			}}
			onkeydown={() => {}}
			role="option"
			tabindex="-1"
			aria-selected={i === selected}
		>
			<GripVerticalIcon
				class={cn('size-4 shrink-0 text-muted-foreground', pending ? 'cursor-grab' : 'invisible')}
			/>
			<div class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-elevated">
				<FilmIcon class="size-4 text-muted-foreground" />
			</div>
			<div class="flex min-w-0 flex-1 items-baseline gap-2">
				<span class="truncate">{job.title ?? 'Untitled video'}</span>
				{#if job.request}
					<span class="truncate text-muted-foreground">{job.request}</span>
				{/if}
			</div>
			{#if job.status === 'processing'}
				<span class="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
					{job.stop_requested ? 'Stopping…' : (stepLabels[job.current_step ?? ''] ?? 'Starting')}
					<span class="h-1 w-16 overflow-hidden rounded-full bg-elevated">
						<span class="block h-full bg-info" style:width="{job.progress}%"></span>
					</span>
				</span>
			{/if}
			<span class="w-16 shrink-0 text-right text-xs text-muted-foreground">
				{#if job.media?.duration_s ?? job.duration_s}
					<Timecode seconds={(job.media?.duration_s ?? job.duration_s)!} />
				{/if}
			</span>
			<span class="w-24 shrink-0"><StatusBadge status={job.status} /></span>
			<span class="hidden w-24 shrink-0 text-right text-xs text-muted-foreground md:block">
				{timeAgo(job.created_at)}
			</span>
			<div class="flex w-28 shrink-0 justify-end gap-1">
				{#if can(job.status, 'stop')}
					<Button
						size="xs"
						variant="outline"
						disabled={job.stop_requested}
						onclick={() => run('stop', job)}>Stop</Button
					>
				{:else if can(job.status, 'retry')}
					<Button size="xs" variant="outline" onclick={() => run('retry', job)}>Retry</Button>
				{:else if can(job.status, 'requeue')}
					<Button size="xs" variant="outline" onclick={() => run('requeue', job)}>Re-queue</Button>
				{:else if can(job.status, 'answer')}
					<Button size="xs" variant="outline" onclick={() => (openId = job.id)}>Answer</Button>
				{:else if can(job.status, 'open_clips')}
					<Button size="xs" variant="outline" href={resolve(`/clips/${job.id}`)}>Open clips</Button>
				{/if}
				{#if can(job.status, 'delete')}
					<Button size="xs" variant="ghost" onclick={() => (confirmDelete = job)}>Delete</Button>
				{/if}
			</div>
		</li>
	{/each}
</ul>

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
				}}>Delete</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
