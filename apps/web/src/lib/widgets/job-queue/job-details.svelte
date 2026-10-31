<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import CircleSlashIcon from '@lucide/svelte/icons/circle-slash';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import MessageCircleQuestionIcon from '@lucide/svelte/icons/message-circle-question-mark';
	import SquareIcon from '@lucide/svelte/icons/square';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import ListRestartIcon from '@lucide/svelte/icons/list-restart';
	import ScissorsIcon from '@lucide/svelte/icons/scissors';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { resolve } from '$app/paths';
	import * as Dialog from '$lib/shared/ui/dialog';
	import * as InputGroup from '$lib/shared/ui/input-group';
	import { Button } from '$lib/shared/ui/button';
	import { CopyButton } from '$lib/shared/ui/copy-button';
	import { Skeleton } from '$lib/shared/ui/skeleton';
	import { Textarea } from '$lib/shared/ui/textarea';
	import { StatusBadge } from '$lib/shared/ui/status-badge';
	import { Timecode, formatTimecode } from '$lib/shared/ui/timecode';
	import { can, stepLabels, type Job, type Transcript } from '$lib/entities/job';
	import { RequiresAI } from '$lib/entities/api-key';
	import { groupTranscript } from './format';

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
	let query = $state('');
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

	const paragraphs = $derived(utterances ? groupTranscript(utterances) : []);
	const shown = $derived(
		query.trim()
			? paragraphs.filter((p) => p.text.toLowerCase().includes(query.trim().toLowerCase()))
			: paragraphs
	);
	const transcriptText = $derived(
		paragraphs.map((p) => `${formatTimecode(p.start, { whole: true })} ${p.text}`).join('\n')
	);

	// Reset editable fields when a different job opens.
	const jobId = $derived(job?.id);
	$effect(() => {
		void jobId;
		request = job?.request ?? '';
		answer = '';
		query = '';
		showDetail = false;
	});

	const time = (s?: string) =>
		s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
	const stepStatus = {
		running: { label: 'Running', icon: LoaderCircleIcon, class: 'text-info' },
		done: { label: 'Done', icon: CircleCheckIcon, class: 'text-success' },
		failed: { label: 'Failed', icon: CircleXIcon, class: 'text-danger' },
		stopped: { label: 'Stopped', icon: CircleSlashIcon, class: 'text-muted-foreground' }
	};
</script>

<Dialog.Root open={!!job} onOpenChange={(o) => !o && onclose()}>
	<Dialog.Content size="xl">
		{#if job}
			{@const duration = job.media?.duration_s ?? job.duration_s}
			<Dialog.Header>
				<Dialog.Title class="truncate leading-snug">{job.title ?? 'Untitled video'}</Dialog.Title>
				<div class="flex items-center gap-2">
					<span aria-live="polite"><StatusBadge status={job.status} /></span>
					<span class="font-mono text-xs text-muted-foreground" title={job.id}>
						{job.id.slice(0, 8)}…
					</span>
					<CopyButton value={job.id} label="Copy job ID" />
				</div>
			</Dialog.Header>

			<Dialog.Body class="flex flex-col divide-y p-0 [&>section]:px-5 [&>section]:py-4">
				{#if job.status === 'processing'}
					<section aria-label="Progress">
						<div class="flex items-center justify-between gap-3">
							<span aria-live="polite">
								{job.stop_requested
									? 'Stopping after this step…'
									: (stepLabels[job.current_step ?? ''] ?? 'Starting')}
							</span>
							<span class="text-xs text-muted-foreground tabular-nums">{job.progress}%</span>
						</div>
						<div
							class="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated"
							role="progressbar"
							aria-label="Progress"
							aria-valuenow={job.progress}
							aria-valuemin={0}
							aria-valuemax={100}
						>
							<div
								class="h-full rounded-full bg-info transition-[width]"
								style:width="{job.progress}%"
							></div>
						</div>
					</section>
				{/if}

				{#if job.error}
					<section aria-label="Error">
						<div class="flex gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3">
							<CircleXIcon class="mt-0.5 shrink-0 text-danger" />
							<div class="flex min-w-0 flex-1 flex-col gap-2">
								<p class="text-foreground">{job.error}</p>
								{#if job.error_detail}
									<Button
										size="xs"
										variant="ghost"
										class="-ml-2 self-start"
										aria-expanded={showDetail}
										onclick={() => (showDetail = !showDetail)}
									>
										{showDetail ? 'Hide details' : 'Show details'}
									</Button>
									{#if showDetail}
										<pre
											class="max-h-48 overflow-auto rounded-md bg-subtle p-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">{job.error_detail}</pre>
									{/if}
								{/if}
							</div>
						</div>
					</section>
				{/if}

				{#if can(job.status, 'answer')}
					<section aria-labelledby="job-question">
						<div
							class="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent-subtle p-3"
						>
							<div class="flex gap-3">
								<MessageCircleQuestionIcon class="mt-0.5 shrink-0 text-accent-text" />
								<div class="flex flex-col gap-1">
									<h3 id="job-question" class="font-medium">Your input is needed</h3>
									<p>{job.input_request?.question ?? 'The pipeline needs your input.'}</p>
								</div>
							</div>
							{#if job.input_request?.flagged?.length}
								<ul class="flex flex-col gap-1 rounded-md bg-subtle p-2 text-muted-foreground">
									{#each job.input_request.flagged as f, i (i)}
										<li class="flex gap-3">
											<span class="shrink-0 text-foreground"
												><Timecode seconds={f.start} whole />–<Timecode
													seconds={f.end}
													whole
												/></span
											>
											<span>{f.why}</span>
										</li>
									{/each}
								</ul>
							{/if}
							{#if job.input_request?.options?.length}
								<!-- Answering re-runs AI steps; Cancel (= delete) never needs a key. -->
								<RequiresAI need={['llm', 'transcription']}>
									{#snippet children({ disabled })}
										<div class="flex flex-wrap gap-2">
											{#each job.input_request?.options ?? [] as option (option)}
												<Button
													size="sm"
													variant="outline"
													disabled={disabled && option !== 'Cancel'}
													onclick={() =>
														option === 'Cancel'
															? ondelete(job)
															: run('answer', job, { answer: option })}>{option}</Button
												>
											{/each}
										</div>
									{/snippet}
								</RequiresAI>
							{/if}
							{#if !job.input_request?.options?.length || job.input_request.allow_text}
								<Textarea
									bind:value={answer}
									rows={3}
									aria-label="Your answer"
									placeholder={job.input_request?.options?.length
										? 'Or tell us what you want'
										: 'Your answer'}
								/>
								<div class="flex justify-end">
									<RequiresAI need={['llm', 'transcription']}>
										{#snippet children({ disabled })}
											<Button
												size="sm"
												onclick={() => run('answer', job, { answer })}
												disabled={disabled || !answer.trim()}>Send answer</Button
											>
										{/snippet}
									</RequiresAI>
								</div>
							{/if}
						</div>
					</section>
				{/if}

				{#if job.note}
					<section><p class="text-muted-foreground">{job.note}</p></section>
				{/if}

				<section class="grid gap-6 sm:grid-cols-2">
					<div class="flex flex-col gap-2">
						<h3 class="text-xs font-medium text-muted-foreground">Details</h3>
						<dl class="grid grid-cols-[6rem_1fr] gap-y-2">
							<dt class="text-muted-foreground">Duration</dt>
							<dd>
								{#if duration}<Timecode seconds={duration} whole />{:else}—{/if}
							</dd>
							{#if job.media}
								<dt class="text-muted-foreground">Resolution</dt>
								<dd class="tabular-nums">{job.media.width}×{job.media.height}</dd>
							{/if}
							<dt class="text-muted-foreground">Added</dt>
							<dd>{time(job.created_at)}</dd>
							{#if job.status === 'done'}
								<dt class="text-muted-foreground">Clips</dt>
								<dd class="tabular-nums">{job.clip_count ?? 0}</dd>
							{/if}
						</dl>
					</div>
					{#if job.steps.length}
						<div class="flex flex-col gap-2">
							<h3 class="text-xs font-medium text-muted-foreground">Steps</h3>
							<ol class="flex flex-col gap-2">
								{#each job.steps as s, i (i)}
									{@const st = stepStatus[s.status]}
									<li class="flex items-center gap-2">
										<st.icon
											class={[st.class, s.status === 'running' && 'animate-spin']}
											aria-hidden="true"
										/>
										<span class="min-w-0 flex-1 truncate">{stepLabels[s.step] ?? s.step}</span>
										<span class="sr-only">{st.label}</span>
										<span class="shrink-0 text-xs text-muted-foreground"
											>{time(s.finished_at ?? s.started_at)}</span
										>
									</li>
								{/each}
							</ol>
						</div>
					{/if}
				</section>

				<section class="flex flex-col gap-2" aria-labelledby="job-request">
					<h3 id="job-request" class="text-xs font-medium text-muted-foreground">
						What should we look for?
					</h3>
					{#if can(job.status, 'edit_request')}
						<Textarea
							bind:value={request}
							rows={2}
							aria-labelledby="job-request"
							placeholder="Optional"
							maxlength={2000}
						/>
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

				{#if job.transcript_path}
					<section class="flex flex-col gap-2" aria-labelledby="job-transcript">
						<div class="flex h-6 items-center justify-between gap-2">
							<h3 id="job-transcript" class="text-xs font-medium text-muted-foreground">
								Transcript
							</h3>
							{#if paragraphs.length}<CopyButton
									value={transcriptText}
									label="Copy transcript"
								/>{/if}
						</div>
						{#if utterances === null}
							<div class="flex flex-col gap-2" aria-label="Loading transcript">
								<Skeleton class="h-4 w-full" />
								<Skeleton class="h-4 w-5/6" />
								<Skeleton class="h-4 w-2/3" />
							</div>
						{:else if !paragraphs.length}
							<p class="text-muted-foreground">No speech found.</p>
						{:else}
							<InputGroup.Root>
								<InputGroup.Addon><SearchIcon /></InputGroup.Addon>
								<InputGroup.Input
									bind:value={query}
									placeholder="Search transcript"
									aria-label="Search transcript"
								/>
							</InputGroup.Root>
							<ol
								class="flex max-h-80 flex-col divide-y overflow-y-auto rounded-lg border bg-subtle"
								aria-label="Transcript"
							>
								{#each shown as p (p.start)}
									<li class="grid grid-cols-[3.5rem_1fr] gap-3 px-3 py-2">
										<span class="pt-px text-muted-foreground"
											><Timecode seconds={p.start} whole /></span
										>
										<p class="leading-relaxed">{p.text}</p>
									</li>
								{:else}
									<li class="px-3 py-2 text-muted-foreground">
										No lines match “{query.trim()}”.
									</li>
								{/each}
							</ol>
						{/if}
					</section>
				{/if}
			</Dialog.Body>

			<Dialog.Footer>
				{#if can(job.status, 'delete')}
					<Button variant="ghost" class="sm:mr-auto" onclick={() => ondelete(job)}
						><TrashIcon />Delete</Button
					>
				{/if}
				{#if can(job.status, 'stop')}
					<Button variant="outline" disabled={job.stop_requested} onclick={() => run('stop', job)}>
						<SquareIcon />{job.stop_requested ? 'Stopping…' : 'Stop'}
					</Button>
				{/if}
				{#if can(job.status, 'retry')}
					<Button variant="outline" onclick={() => run('retry', job)}><RotateCcwIcon />Retry</Button
					>
				{/if}
				{#if can(job.status, 'requeue')}
					<Button variant="outline" onclick={() => run('requeue', job)}
						><ListRestartIcon />Re-queue</Button
					>
				{/if}
				{#if can(job.status, 'open_clips')}
					<Button href={resolve(`/clips/${job.id}`)}><ScissorsIcon />Open clips</Button>
				{/if}
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
