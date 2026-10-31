<script lang="ts">
	// Editor layout: toolbar (top), session clips (left), preview + transport (centre), tracks
	// (bottom), properties + agent chat (right).
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Redo2Icon from '@lucide/svelte/icons/redo-2';
	import Undo2Icon from '@lucide/svelte/icons/undo-2';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import type { EditorClip, Timeline, Word } from '$lib/entities/timeline';
	import { comboOf, editorKeys, type EditorAction } from '$lib/shared/config';
	import { formAction } from '$lib/shared/lib/form-action';
	import { isTyping } from '$lib/shared/lib/is-typing';
	import { Button } from '$lib/shared/ui/button';
	import { Separator } from '$lib/shared/ui/separator';
	import { StatusBadge } from '$lib/shared/ui/status-badge';
	import { cn } from '$lib/shared/lib/utils';
	import { CLIP_DRAG_TYPE, EditorState } from './editor-state.svelte';
	import Preview from './preview.svelte';
	import Tracks from './tracks.svelte';
	import Properties from './properties.svelte';
	import FinishDialog from './finish-dialog.svelte';
	import ToolButton from './tool-button.svelte';
	import { renderBadge } from './render-badge';
	import { page } from '$app/state';
	import { AgentChat, learnFromEdits } from '$lib/features/editor-agent';

	let {
		clip,
		clips,
		timeline,
		revision,
		urls,
		sourceName
	}: {
		clip: EditorClip;
		clips: EditorClip[];
		timeline: Timeline;
		revision: number;
		urls: Record<string, string>;
		/** The original video's name (job title). */
		sourceName: string;
	} = $props();

	// svelte-ignore state_referenced_locally (the route re-creates this component per clip)
	const editor = new EditorState(timeline, revision, urls, async (f) => {
		const r = await formAction<{ revision: number }>('save', {
			revision: f.revision,
			timeline: JSON.stringify(f.timeline),
			events: JSON.stringify(f.events),
			render: f.render ? '1' : ''
		});
		// Learning from edits (plan 7): the server only runs it every 25 new events.
		if (f.events.length && page.data.ai?.llm) void learnFromEdits();
		return r;
	});
	// svelte-ignore state_referenced_locally
	for (const c of clips)
		if (c.file_key && c.file_end_s !== null && c.file_start_s !== null)
			editor.durations[c.file_key] = c.file_end_s - c.file_start_s;

	// svelte-ignore state_referenced_locally
	const wordsByKey: Record<string, Word[]> = Object.fromEntries(
		clips.filter((c) => c.file_key).map((c) => [c.file_key!, c.words ?? []])
	);

	// Live render status per session clip; polled while any render is queued or running.
	// svelte-ignore state_referenced_locally
	let renders = $state<Record<string, { status: string | null; error: string | null }>>(
		Object.fromEntries(clips.map((c) => [c.id, { status: c.render_status, error: c.render_error }]))
	);
	const rendering = $derived(
		Object.values(renders).some((r) => r.status === 'queued' || r.status === 'rendering')
	);
	/** Sent to render by the user (green check in the clip list): queued, rendering or done. */
	const resolved = (id: string) =>
		['queued', 'rendering', 'done'].includes(renders[id]?.status ?? '');

	$effect(() => {
		if (!rendering) return;
		const timer = setInterval(async () => {
			const res = await fetch(resolve(`/editor/${clip.id}/renders`));
			if (!res.ok) return;
			for (const r of (await res.json()) as { id: string; status: string; error: string }[])
				renders[r.id] = { status: r.status, error: r.error };
		}, 3000);
		return () => clearInterval(timer);
	});

	let uploading: 'voiceover' | 'music' | 'video' | null = $state(null);
	let finishing = $state(false);
	let finishOpen = $state(false);

	const clipIndex = $derived(clips.findIndex((c) => c.id === clip.id));
	const clipBadge = $derived(renderBadge(renders[clip.id].status));
	const statusText = $derived(
		{ saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving…', error: 'Not saved' }[
			editor.status
		]
	);

	function mediaDuration(file: File) {
		return new Promise<number>((ok, fail) => {
			const el = document.createElement('video');
			const url = URL.createObjectURL(file);
			el.preload = 'metadata';
			el.onloadedmetadata = () => (URL.revokeObjectURL(url), ok(el.duration));
			el.onerror = () => (URL.revokeObjectURL(url), fail(new Error('Could not read that file.')));
			el.src = url;
		});
	}

	/** `at` = segment index for a video, output time for a voiceover (defaults: end / playhead). */
	async function upload(kind: 'voiceover' | 'music' | 'video', file: File, at?: number) {
		uploading = kind;
		try {
			const length = kind === 'video' ? await mediaDuration(file) : 0;
			const r = await formAction<{ key: string; putUrl: string; getUrl: string }>('presignUpload', {
				name: file.name,
				type: file.type,
				size: file.size
			});
			const res = await fetch(r.putUrl, { method: 'PUT', body: file });
			if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
			editor.urls[r.key] = r.getUrl;
			if (kind === 'video') {
				editor.durations[r.key] = length;
				editor.apply('merge_clip', { sourceKey: r.key, start: 0, end: length, at });
			} else {
				const start = kind === 'voiceover' ? (at ?? editor.playhead) : 0;
				editor.apply('add_audio', { kind, key: r.key, start });
			}
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Upload failed.');
		} finally {
			uploading = null;
		}
	}

	function mergeClip(c: EditorClip, at?: number) {
		if (!c.file_key || c.file_start_s === null) return;
		editor.apply('merge_clip', {
			sourceKey: c.file_key,
			start: c.start_s - c.file_start_s,
			end: c.end_s - c.file_start_s,
			at
		});
	}

	/** Timeline drop: a session clip or a video goes in as a segment at the nearest cut; an
	 * audio file becomes a voiceover starting where it was dropped. */
	function dropOnTimeline(d: { clipId?: string; file?: File; time: number; at: number }) {
		if (d.clipId) {
			const c = clips.find((x) => x.id === d.clipId);
			if (c) mergeClip(c, d.at);
		} else if (d.file?.type.startsWith('video/')) void upload('video', d.file, d.at);
		else if (d.file?.type.startsWith('audio/')) void upload('voiceover', d.file, d.time);
		else if (d.file) toast.error('Drop a video or audio file.');
	}

	/** Save + queue this clip's render, then move on to the next clip not yet resolved. */
	async function saveAndRender() {
		if (!(await editor.flush(true))) return;
		renders[clip.id] = { status: 'queued', error: null };
		const next = [...clips.slice(clipIndex + 1), ...clips.slice(0, clipIndex)].find(
			(c) => !resolved(c.id)
		);
		toast.success(next ? 'Rendering. On to the next clip.' : 'Saved. Rendering this clip now.');
		if (next) await goto(resolve(`/editor/${next.id}`));
	}

	async function finishAll() {
		finishing = true;
		try {
			if (!(await editor.flush())) return;
			const r = await formAction<{ queued: string[] }>('renderAll', {});
			for (const id of r.queued) renders[id] = { status: 'queued', error: null };
			finishOpen = true;
			if (page.data.ai?.llm) void learnFromEdits(true);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not start the renders.');
		} finally {
			finishing = false;
		}
	}

	/** Runs an editor action, from a shortcut or a toolbar button. */
	function run(action: EditorAction) {
		const t = editor.timeline;
		switch (action) {
			case 'play':
				editor.playing = !editor.playing;
				break;
			case 'back':
				editor.playhead = Math.max(0, editor.playhead - 5);
				break;
			case 'pause':
				editor.playing = false;
				break;
			case 'forward':
				editor.playing = true;
				break;
			case 'split':
				editor.apply('split', { at: editor.playhead });
				break;
			case 'mark_in':
				editor.markIn = editor.playhead;
				break;
			case 'mark_out':
				editor.markOut = editor.playhead;
				break;
			case 'delete':
				if (editor.markIn !== null || editor.markOut !== null) {
					const start = editor.markIn ?? 0;
					const end = editor.markOut ?? editor.total;
					if (
						editor.apply('delete_range', { start: Math.min(start, end), end: Math.max(start, end) })
					)
						editor.markIn = editor.markOut = null;
				} else if (editor.selected?.kind === 'segment') {
					const i = editor.selected.index;
					const start = t.segments.slice(0, i).reduce((d, s) => d + s.end - s.start, 0);
					const end = start + t.segments[i].end - t.segments[i].start;
					if (editor.apply('delete_range', { start, end })) editor.selected = null;
				}
				break;
			case 'undo':
				editor.undo();
				break;
			case 'redo':
				editor.redo();
				break;
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (isTyping(e.target) || e.altKey || finishOpen) return;
		const action = editorKeys[comboOf(e)];
		if (!action) return;
		e.preventDefault();
		run(action);
	}

	beforeNavigate(() => void editor.flush());
</script>

<svelte:window
	{onkeydown}
	onbeforeunload={(e) => {
		if (editor.status !== 'saved') e.preventDefault();
	}}
/>

<div
	data-full-width
	class="grid h-[calc(100svh-5.5rem)] min-h-[36rem] animate-in-fade grid-cols-[13rem_minmax(0,1fr)_20rem] grid-rows-[auto_minmax(0,1fr)_auto] gap-3"
>
	<header class="col-span-3 flex h-10 items-center gap-3">
		<div class="flex min-w-0 items-center gap-2">
			<h1 class="shrink-0 text-base font-semibold">Clip {clipIndex + 1}</h1>
			<span class="truncate text-muted-foreground" title={clip.reason}>{clip.reason}</span>
			{#if clipBadge}<StatusBadge status={clipBadge} />{/if}
		</div>
		<span class="flex-1"></span>
		<span
			class={cn(
				'flex items-center gap-1.5 text-xs',
				editor.status === 'error' ? 'text-danger' : 'text-muted-foreground'
			)}
			aria-live="polite"
		>
			{#if editor.status === 'saving'}
				<LoaderCircleIcon class="size-3.5 animate-spin" />
			{:else if editor.status === 'error'}
				<CircleAlertIcon class="size-3.5" />
			{:else if editor.status === 'saved'}
				<CheckIcon class="size-3.5" />
			{:else}
				<span class="size-1.5 rounded-full bg-warning"></span>
			{/if}
			{statusText}
		</span>
		<Separator orientation="vertical" class="data-vertical:h-5 data-vertical:self-center" />
		<div class="flex items-center">
			<ToolButton label="Undo" action="undo" disabled={!editor.canUndo} onclick={() => run('undo')}>
				<Undo2Icon />
			</ToolButton>
			<ToolButton label="Redo" action="redo" disabled={!editor.canRedo} onclick={() => run('redo')}>
				<Redo2Icon />
			</ToolButton>
		</div>
		<Button
			size="sm"
			variant="outline"
			disabled={editor.status === 'saving'}
			onclick={saveAndRender}
		>
			Render clip
		</Button>
		<Button size="sm" disabled={finishing} onclick={finishAll}>
			{#if finishing}<LoaderCircleIcon class="animate-spin" />{/if}
			Finish all clips
		</Button>
	</header>

	<aside class="flex min-h-0 flex-col gap-1 overflow-y-auto rounded-xl border bg-surface p-2">
		<h2 class="px-2 py-1 text-xs font-medium text-muted-foreground">Clips in this session</h2>
		{#each clips as c, i (c.id)}
			{@const r = renders[c.id]}
			{@const badge = renderBadge(r.status)}
			{@const current = c.id === clip.id}
			<div
				class={cn(
					'group relative flex flex-col gap-1.5 rounded-lg border p-2 transition-colors',
					current
						? 'border-border-strong bg-elevated'
						: 'cursor-grab border-transparent hover:bg-elevated/60'
				)}
				draggable={!current}
				ondragstart={(e) => {
					e.dataTransfer?.setData(CLIP_DRAG_TYPE, c.id);
					if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
				}}
				role="listitem"
				title={!current ? 'Drag onto the timeline to add it' : undefined}
			>
				{#if current}
					<span class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"></span>
				{/if}
				<button
					type="button"
					class="rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
					aria-current={current ? 'page' : undefined}
					onclick={() => goto(resolve(`/editor/${c.id}`))}
				>
					<span class="flex items-center justify-between gap-2">
						<span class="font-medium">Clip {i + 1}</span>
						{#if resolved(c.id)}
							<span
								class="flex size-4 items-center justify-center rounded-full bg-success text-background"
								role="img"
								aria-label="Resolved"
							>
								<CheckIcon class="size-3" strokeWidth={3} />
							</span>
						{/if}
					</span>
					<span class="line-clamp-2 text-xs text-muted-foreground">{c.reason}</span>
				</button>
				<div class="flex h-6 items-center justify-between gap-2">
					{#if badge}
						<StatusBadge status={badge} />
					{:else}
						<span class="text-xs text-muted-foreground">Not rendered</span>
					{/if}
					{#if !current}
						<span class="flex items-center gap-0.5">
							<GripVerticalIcon
								class="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
							/>
							<ToolButton
								label="Add to the end of this clip"
								size="icon-xs"
								onclick={() => mergeClip(c)}
							>
								<PlusIcon />
							</ToolButton>
						</span>
					{/if}
				</div>
				{#if r.error}<p class="text-xs text-danger">{r.error}</p>{/if}
			</div>
		{/each}
	</aside>

	<section class="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-surface">
		<Preview {editor} {wordsByKey} onaction={run} />
	</section>

	<aside class="row-span-2 flex min-h-0 flex-col overflow-hidden rounded-xl border bg-surface">
		<Properties {editor} onupload={upload} {uploading} />
		<AgentChat host={editor} clipId={clip.id} {wordsByKey} />
	</aside>

	<div class="col-span-2">
		<Tracks {editor} {wordsByKey} {sourceName} ondrop={dropOnTimeline} onaction={run} />
	</div>
</div>

<FinishDialog bind:open={finishOpen} clipId={clip.id} />
