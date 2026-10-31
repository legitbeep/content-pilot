<script lang="ts">
	// Editor layout: session clips (left), preview, tracks (bottom), properties + agent slot (right).
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import type { EditorClip, Timeline, Word } from '$lib/entities/timeline';
	import { comboOf, editorKeys } from '$lib/shared/config';
	import { formAction } from '$lib/shared/lib/form-action';
	import { isTyping } from '$lib/shared/lib/is-typing';
	import { Button } from '$lib/shared/ui/button';
	import { StatusBadge } from '$lib/shared/ui/status-badge';
	import { TopbarActions } from '$lib/shared/ui/topbar-actions';
	import { cn } from '$lib/shared/lib/utils';
	import { CLIP_DRAG_TYPE, EditorState } from './editor-state.svelte';
	import Preview from './preview.svelte';
	import Tracks from './tracks.svelte';
	import Properties from './properties.svelte';
	import FinishDialog from './finish-dialog.svelte';
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

	let uploading: 'voiceover' | 'music' | 'video' | null = $state(null);
	let finishing = $state(false);
	let finishOpen = $state(false);

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

	async function saveAndRender() {
		if (await editor.flush(true)) toast.success('Saved. Rendering this clip now.');
	}

	async function finishAll() {
		finishing = true;
		try {
			if (!(await editor.flush())) return;
			await formAction('renderAll', {});
			finishOpen = true;
			if (page.data.ai?.llm) void learnFromEdits(true);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not start the renders.');
		} finally {
			finishing = false;
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (isTyping(e.target) || e.altKey || finishOpen) return;
		const action = editorKeys[comboOf(e)];
		if (!action) return;
		e.preventDefault();
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

	beforeNavigate(() => void editor.flush());
</script>

<svelte:window
	{onkeydown}
	onbeforeunload={(e) => {
		if (editor.status !== 'saved') e.preventDefault();
	}}
/>

<TopbarActions>
	<span class={cn('text-xs', editor.status === 'error' ? 'text-danger' : 'text-muted-foreground')}>
		{statusText}
	</span>
	<Button size="sm" variant="outline" disabled={!editor.canUndo} onclick={() => editor.undo()}>
		Undo
	</Button>
	<Button size="sm" variant="outline" disabled={!editor.canRedo} onclick={() => editor.redo()}>
		Redo
	</Button>
	<Button size="sm" variant="outline" disabled={finishing} onclick={finishAll}>
		Finish all clips
	</Button>
	<Button size="sm" disabled={editor.status === 'saving'} onclick={saveAndRender}>Save</Button>
</TopbarActions>

<div
	data-full-width
	class="grid h-[calc(100svh-5.5rem)] min-h-[36rem] grid-cols-[13rem_minmax(0,1fr)_19rem] grid-rows-[minmax(0,1fr)_auto] gap-3"
>
	<aside class="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-lg border bg-surface p-2">
		<h2 class="px-1 text-xs font-medium text-muted-foreground">Clips in this session</h2>
		{#each clips as c, i (c.id)}
			{@const badge = renderBadge(c.render_status)}
			<div
				class={cn(
					'flex flex-col gap-1.5 rounded-md border p-2',
					c.id === clip.id ? 'border-border-strong bg-elevated' : 'border-transparent',
					c.id !== clip.id && 'cursor-grab'
				)}
				draggable={c.id !== clip.id}
				ondragstart={(e) => {
					e.dataTransfer?.setData(CLIP_DRAG_TYPE, c.id);
					if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
				}}
				role="listitem"
				title={c.id !== clip.id ? 'Drag onto the timeline to add it' : undefined}
			>
				<button
					type="button"
					class="text-left text-sm"
					onclick={() => goto(resolve(`/editor/${c.id}`))}
				>
					<span class="line-clamp-2">Clip {i + 1}: {c.reason}</span>
				</button>
				<div class="flex items-center justify-between gap-2">
					{#if badge}
						<StatusBadge status={badge} />
					{:else}
						<span class="text-xs text-muted-foreground">Not rendered</span>
					{/if}
					{#if c.id !== clip.id}
						<Button size="sm" variant="ghost" class="h-6 px-2 text-xs" onclick={() => mergeClip(c)}>
							Add here
						</Button>
					{/if}
				</div>
				{#if c.render_error}<p class="text-xs text-danger">{c.render_error}</p>{/if}
			</div>
		{/each}
	</aside>

	<section class="min-h-0">
		<Preview {editor} {wordsByKey} />
	</section>

	<aside
		class="row-span-2 flex min-h-0 flex-col gap-3 overflow-y-auto rounded-lg border bg-surface p-3"
	>
		<Properties {editor} onupload={upload} {uploading} />
		<AgentChat host={editor} clipId={clip.id} {wordsByKey} />
	</aside>

	<div class="col-span-2">
		<Tracks {editor} {wordsByKey} {sourceName} ondrop={dropOnTimeline} />
	</div>
</div>

<FinishDialog bind:open={finishOpen} clipId={clip.id} />
