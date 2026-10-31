<script lang="ts">
	import UploadIcon from '@lucide/svelte/icons/upload';
	import FileVideoIcon from '@lucide/svelte/icons/file-video';
	import { invalidate } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/shared/ui/button';
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
	let progress = $state<number | null>(null);
	let dragging = $state(false);
	let input = $state<HTMLInputElement>();

	async function pick(f: File | undefined) {
		if (!f || progress !== null) return;
		error = '';
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
			file = null;
			request = '';
			await invalidate('app:jobs');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed.';
		} finally {
			progress = null;
		}
	}
</script>

<div class="flex flex-col gap-3 rounded-lg border p-4">
	<button
		type="button"
		class={cn(
			'flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-muted-foreground transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
			dragging && 'border-border-strong bg-elevated'
		)}
		disabled={progress !== null}
		onclick={() => input?.click()}
		ondragover={(e) => {
			e.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={(e) => {
			e.preventDefault();
			dragging = false;
			pick(e.dataTransfer?.files[0]);
		}}
	>
		{#if file}
			<FileVideoIcon class="size-5" />
			<span class="text-foreground">{file.name}</span>
			<span class="text-xs">
				{(file.size / 1024 ** 2).toFixed(0)} MB
				{#if duration}· <Timecode seconds={duration} />{/if}
			</span>
		{:else}
			<UploadIcon class="size-5" />
			<span>Drop a long video here, or click to choose one.</span>
			<span class="text-xs">Video files up to 2 GB and 60 minutes.</span>
		{/if}
	</button>
	<input
		bind:this={input}
		type="file"
		accept="video/*"
		class="hidden"
		onchange={(e) => pick(e.currentTarget.files?.[0])}
	/>

	<Textarea
		bind:value={request}
		placeholder="What should we look for? (optional) e.g. funny moments about hiring"
		rows={2}
		maxlength={2000}
		disabled={progress !== null}
	/>

	{#if error}<p class="text-xs text-danger">{error}</p>{/if}

	<div class="flex items-center justify-end gap-3">
		{#if progress !== null}
			<div class="h-1 flex-1 overflow-hidden rounded-full bg-elevated">
				<div class="h-full bg-info transition-[width]" style:width="{progress}%"></div>
			</div>
			<span class="w-10 text-right font-mono text-xs text-muted-foreground">
				{Math.floor(progress)}%
			</span>
		{/if}
		<RequiresAI need={['llm', 'transcription']}>
			{#snippet children({ disabled })}
				<Button onclick={upload} disabled={disabled || !file || progress !== null}>
					{progress !== null ? 'Uploading…' : 'Upload'}
				</Button>
			{/snippet}
		</RequiresAI>
	</div>
</div>
