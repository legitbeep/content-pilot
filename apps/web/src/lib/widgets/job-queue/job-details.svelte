<script lang="ts">
	import * as Sheet from '$lib/shared/ui/sheet';
	import { Button } from '$lib/shared/ui/button';
	import { Textarea } from '$lib/shared/ui/textarea';
	import { StatusBadge } from '$lib/shared/ui/status-badge';
	import { Timecode } from '$lib/shared/ui/timecode';
	import { can, stepLabels, type Job, type Transcript } from '$lib/entities/job';

	let {
		job,
		onclose,
		run,
		ondelete
	}: {
		job: Job | null;
		onclose: () => void;
		run: (name: string, job: Job, fields?: Record<string, string>) => Promise<boolean>;
		ondelete: (job: Job) => void;
	} = $props();

	let utterances = $state<Transcript['utterances'] | null>(null);
	let request = $state('');
	let answer = $state('');
	let showDetail = $state(false);

	// Load the transcript preview once per job (when it has one).
	const transcriptFor = $derived(job?.transcript_path ? job.id : null);
	$effect(() => {
		const id = transcriptFor;
		utterances = null;
		if (!id) return;
		let cancelled = false;
		fetch(`/queue/${id}/transcript`)
			.then((r) => (r.ok ? r.json() : { utterances: [] }))
			.then((d) => !cancelled && (utterances = d.utterances));
		return () => (cancelled = true);
	});

	// Reset editable fields when a different job opens.
	const jobId = $derived(job?.id);
	$effect(() => {
		void jobId;
		request = job?.request ?? '';
		answer = '';
		showDetail = false;
	});

	const time = (s?: string) =>
		s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
</script>

<Sheet.Root open={!!job} onOpenChange={(o) => !o && onclose()}>
	<Sheet.Content side="right" class="w-full gap-0 sm:max-w-lg">
		{#if job}
			<Sheet.Header>
				<Sheet.Title class="truncate pr-6">{job.title ?? 'Untitled video'}</Sheet.Title>
				<div class="flex items-center gap-2"><StatusBadge status={job.status} /></div>
			</Sheet.Header>

			<div class="flex flex-col gap-6 overflow-y-auto px-4 pb-6">
				<dl class="grid grid-cols-[8rem_1fr] gap-y-1.5">
					<dt class="text-muted-foreground">Duration</dt>
					<dd>
						{#if job.media?.duration_s ?? job.duration_s}
							<Timecode seconds={(job.media?.duration_s ?? job.duration_s)!} />
						{:else}—{/if}
					</dd>
					{#if job.media}
						<dt class="text-muted-foreground">Resolution</dt>
						<dd class="font-mono">{job.media.width}×{job.media.height}</dd>
					{/if}
					<dt class="text-muted-foreground">Added</dt>
					<dd>{time(job.created_at)}</dd>
					{#if job.status === 'processing'}
						<dt class="text-muted-foreground">Progress</dt>
						<dd>{stepLabels[job.current_step ?? ''] ?? 'Starting'} · {job.progress}%</dd>
					{/if}
					<dt class="text-muted-foreground">Job ID</dt>
					<dd class="truncate font-mono text-xs leading-5">{job.id}</dd>
				</dl>

				{#if job.note}<p class="text-muted-foreground">{job.note}</p>{/if}

				{#if job.error}
					<div class="rounded-lg border border-danger/30 p-3">
						<p class="text-danger">{job.error}</p>
						{#if job.error_detail}
							<button
								class="mt-2 text-xs text-muted-foreground hover:text-foreground"
								onclick={() => (showDetail = !showDetail)}
							>
								{showDetail ? 'Hide details' : 'Show details'}
							</button>
							{#if showDetail}
								<pre
									class="mt-2 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground">{job.error_detail}</pre>
							{/if}
						{/if}
					</div>
				{/if}

				{#if can(job.status, 'answer')}
					<section class="flex flex-col gap-2">
						<h3 class="font-medium">Question</h3>
						<p>{job.input_request?.question ?? 'The pipeline needs your input.'}</p>
						<Textarea bind:value={answer} rows={3} placeholder="Your answer" />
						<div class="flex justify-end">
							<Button onclick={() => run('answer', job, { answer })} disabled={!answer.trim()}
								>Send answer</Button
							>
						</div>
					</section>
				{/if}

				<section class="flex flex-col gap-2">
					<h3 class="font-medium">What should we look for?</h3>
					{#if can(job.status, 'edit_request')}
						<Textarea bind:value={request} rows={2} placeholder="Optional" maxlength={2000} />
						<div class="flex justify-end">
							<Button
								size="sm"
								variant="outline"
								disabled={request === (job.request ?? '')}
								onclick={() => run('editRequest', job, { request })}>Save</Button
							>
						</div>
					{:else}
						<p class="text-muted-foreground">{job.request ?? 'Nothing specific.'}</p>
					{/if}
				</section>

				{#if job.steps.length}
					<section class="flex flex-col gap-2">
						<h3 class="font-medium">Steps</h3>
						<ol class="flex flex-col gap-1">
							{#each job.steps as s, i (i)}
								<li class="flex justify-between gap-4">
									<span>{stepLabels[s.step] ?? s.step}</span>
									<span
										class={s.status === 'failed'
											? 'text-danger'
											: s.status === 'done'
												? 'text-muted-foreground'
												: 'text-info'}
									>
										{s.status === 'running'
											? 'Running'
											: s.status === 'done'
												? 'Done'
												: s.status === 'failed'
													? 'Failed'
													: 'Stopped'}
										<span class="ml-2 text-xs text-muted-foreground"
											>{time(s.finished_at ?? s.started_at)}</span
										>
									</span>
								</li>
							{/each}
						</ol>
					</section>
				{/if}

				{#if job.transcript_path}
					<section class="flex flex-col gap-2">
						<h3 class="font-medium">Transcript</h3>
						{#if utterances === null}
							<p class="text-muted-foreground">Loading transcript…</p>
						{:else if !utterances.length}
							<p class="text-muted-foreground">No speech found.</p>
						{:else}
							<ol class="flex flex-col gap-3">
								{#each utterances.slice(0, 200) as u, i (i)}
									<li>
										<div class="flex gap-2 text-xs text-muted-foreground">
											<span>Speaker {u.speaker + 1}</span>
											<Timecode seconds={u.start} />
										</div>
										<p>{u.text}</p>
									</li>
								{/each}
							</ol>
							{#if utterances.length > 200}
								<p class="text-xs text-muted-foreground">
									Showing the first 200 of {utterances.length} turns.
								</p>
							{/if}
						{/if}
					</section>
				{/if}
			</div>

			<Sheet.Footer class="flex-row justify-end border-t">
				{#if can(job.status, 'stop')}
					<Button variant="outline" disabled={job.stop_requested} onclick={() => run('stop', job)}>
						{job.stop_requested ? 'Stopping…' : 'Stop'}
					</Button>
				{/if}
				{#if can(job.status, 'retry')}
					<Button variant="outline" onclick={() => run('retry', job)}>Retry</Button>
				{/if}
				{#if can(job.status, 'requeue')}
					<Button variant="outline" onclick={() => run('requeue', job)}>Re-queue</Button>
				{/if}
				{#if can(job.status, 'delete')}
					<Button variant="ghost" onclick={() => ondelete(job)}>Delete</Button>
				{/if}
			</Sheet.Footer>
		{/if}
	</Sheet.Content>
</Sheet.Root>
