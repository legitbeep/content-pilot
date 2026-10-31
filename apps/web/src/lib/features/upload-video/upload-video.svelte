<script lang="ts">
	import UploadIcon from '@lucide/svelte/icons/upload';
	import CloudUploadIcon from '@lucide/svelte/icons/cloud-upload';
	import FileVideoIcon from '@lucide/svelte/icons/file-video';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import XIcon from '@lucide/svelte/icons/x';
	import { invalidate } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button, buttonVariants } from '$lib/shared/ui/button';
	import { Textarea } from '$lib/shared/ui/textarea';
	import { Timecode } from '$lib/shared/ui/timecode';
	import { cn } from '$lib/shared/lib/utils';
	import { formAction } from '$lib/shared/lib/form-action';
	import { RequiresAI } from '$lib/entities/api-key';
	import { checkFile, putFile, readDuration } from './upload';

	let file = $state<File | null>(null);
	let duration = $state<number | null>(null);
	let request = $state('');
	let error = $state('');
	let done = $state(''); // name of the last file added to the queue
	let progress = $state<number | null>(null);
	let dragging = $state(false);
	let input = $state<HTMLInputElement>();

	const mb = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(0)} MB`;

	async function pick(f: File | undefined) {
		if (!f || progress !== null) return;
		error = '';
		done = '';
		const d = f.type.startsWith('video/') ? await readDuration(f) : null;
		const problem = checkFile(f, d);
		if (problem) {
			error = problem;
			file = null;
			return;
		}
		file = f;
		duration = d;
	}

	function clear() {
		file = null;
		duration = null;
		if (input) input.value = '';
	}

	async function upload() {
		if (!file) return;
		error = '';
		progress = 0;
		try {
			const { key, url } = await formAction<{ key: string; url: string }>('presign', {
				name: file.name,
				type: file.type,
				size: file.size
			});
			await putFile(url, file, (p) => (progress = p));
			await formAction('create', {
				key,
				title: file.name,
				request,
				duration: duration ?? ''
			});
			toast.success('Added to the queue');
			done = file.name;
			clear();
			request = '';
			await invalidate('app:jobs');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed.';
		} finally {
			progress = null;
		}
	}
</script>

<section class="flex flex-col gap-3" aria-label="Upload a video">
	<div
		role="region"
		aria-label="Video drop zone"
		class={cn(
			'relative overflow-hidden rounded-xl border border-dashed bg-surface bg-abstract transition-colors',
			dragging && 'border-accent bg-accent-subtle',
			error && !dragging && 'border-danger/50'
		)}
		ondragover={(e) => {
			e.preventDefault();
			if (progress === null) dragging = true;
		}}
		ondragleave={(e) => {
			if (!e.currentTarget.contains(e.relatedTarget as Node | null)) dragging = false;
		}}
		ondrop={(e) => {
			e.preventDefault();
			dragging = false;
			pick(e.dataTransfer?.files[0]);
		}}
	>
		{#if file}
			<div class="flex animate-in-fade flex-col gap-3 p-5">
				<div class="flex items-center gap-3">
					<span
						class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-elevated text-accent-text"
					>
						<FileVideoIcon class="size-5" />
					</span>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-medium">{file.name}</span>
						<span class="text-xs text-muted-foreground tabular-nums">
							{mb(file.size)}
							{#if duration}· <Timecode seconds={duration} />{/if}
						</span>
					</div>
					{#if progress === null}
						<Button variant="ghost" size="sm" onclick={() => input?.click()}>Change</Button>
						<Button variant="ghost" size="icon-sm" aria-label="Remove file" onclick={clear}>
							<XIcon />
						</Button>
					{/if}
				</div>
				{#if progress !== null}
					<div class="flex items-center gap-3">
						<div
							class="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated"
							role="progressbar"
							aria-label="Upload progress"
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={Math.floor(progress)}
						>
							<div
								class="h-full rounded-full bg-info transition-[width]"
								style:width="{progress}%"
							></div>
						</div>
						<span class="w-10 text-right text-xs text-muted-foreground tabular-nums">
							{Math.floor(progress)}%
						</span>
					</div>
				{/if}
			</div>
		{:else}
			<button
				type="button"
				class="flex w-full flex-col items-center gap-3 px-6 py-10 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
				onclick={() => input?.click()}
			>
				<span
					class={cn(
						'flex size-10 items-center justify-center rounded-lg border border-border-strong bg-elevated transition-transform',
						done ? 'text-success' : 'text-accent-text',
						dragging && '-translate-y-0.5'
					)}
				>
					{#if done}<CircleCheckIcon class="size-5" />{:else}<CloudUploadIcon class="size-5" />{/if}
				</span>
				<span class="flex flex-col gap-1">
					<span class="text-base font-medium">
						{#if dragging}Drop to add it{:else if done}Added to the queue{:else}Drop a long video
							here{/if}
					</span>
					<span class="max-w-sm text-muted-foreground">
						{#if done}
							<span class="text-foreground">{done}</span> is being transcribed. Add another video to keep
							going.
						{:else}
							Any video file (MP4, MOV, WebM…), up to 2 GB and 60 minutes.
						{/if}
					</span>
				</span>
				<span class={buttonVariants({ variant: 'outline', size: 'sm' })}>Browse files</span>
			</button>
		{/if}
	</div>
	<input
		bind:this={input}
		type="file"
		accept="video/*"
		class="hidden"
		onchange={(e) => pick(e.currentTarget.files?.[0])}
	/>

	<div aria-live="polite" class="sr-only">
		{progress !== null ? 'Uploading' : done ? `${done} added to the queue` : ''}
	</div>
	{#if error}
		<p role="alert" class="flex animate-in-fade items-center gap-1.5 text-danger">
			<CircleAlertIcon class="size-3.5 shrink-0" />
			{error}
		</p>
	{/if}

	<Textarea
		bind:value={request}
		placeholder="What should we look for? (optional) e.g. funny moments about hiring"
		aria-label="What should we look for? (optional)"
		rows={2}
		maxlength={2000}
		disabled={progress !== null}
	/>

	<div class="flex justify-end">
		<RequiresAI need={['llm', 'transcription']}>
			{#snippet children({ disabled })}
				<Button onclick={upload} disabled={disabled || !file || progress !== null}>
					<UploadIcon />
					{progress !== null ? 'Uploading…' : 'Upload and find clips'}
				</Button>
			{/snippet}
		</RequiresAI>
	</div>
</section>
