<script lang="ts">
	import PlayIcon from '@lucide/svelte/icons/play';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import Volume2Icon from '@lucide/svelte/icons/volume-2';
	import VolumeXIcon from '@lucide/svelte/icons/volume-x';
	import { captionChunks, type Word } from '$lib/entities/timeline';
	import { Button } from '$lib/shared/ui/button';
	import { Timecode } from '$lib/shared/ui/timecode';
	import { cn } from '$lib/shared/lib/utils';
	import { CLIP_DRAG_TYPE, type EditorState } from './editor-state.svelte';

	let {
		editor,
		wordsByKey,
		sourceName,
		ondrop
	}: {
		editor: EditorState;
		wordsByKey: Record<string, Word[]>;
		/** Name of the original video, for the captions lane title. */
		sourceName: string;
		/** A session clip id or a file dropped at output time `time`; `at` = segment index there. */
		ondrop: (d: { clipId?: string; file?: File; time: number; at: number }) => void;
	} = $props();

	const PX_PER_S = 40; // below this the lanes scroll instead of squeezing

	let scroller: HTMLDivElement | undefined = $state();
	let lanes: HTMLDivElement | undefined = $state();
	let dropping = $state(false);
	const t = $derived(editor.timeline);
	const total = $derived(Math.max(editor.total, 0.1));
	const pct = (s: number) => `${(Math.max(0, Math.min(s, total)) / total) * 100}%`;

	const segs = $derived.by(() => {
		let o = 0;
		return t.segments.map((s, i) => {
			const block = { i, start: o, len: s.end - s.start, merged: !!s.sourceKey };
			o += block.len;
			return block;
		});
	});
	const chunks = $derived(captionChunks(t, wordsByKey));
	const step = $derived(total <= 12 ? 1 : total <= 30 ? 2 : total <= 90 ? 5 : 10);
	const ticks = $derived(Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step));

	function timeAt(clientX: number) {
		if (!lanes) return 0;
		const r = lanes.getBoundingClientRect();
		return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * editor.total;
	}

	// Scrub: pointer events only record the target; one rAF per frame moves the playhead, so the
	// preview gets at most one seek per frame (and drops stale ones while a seek is in flight).
	let target: number | null = null;
	let raf = 0;
	function queue(clientX: number) {
		target = timeAt(clientX);
		raf ||= requestAnimationFrame(() => {
			raf = 0;
			if (target !== null) editor.playhead = target;
			target = null;
		});
	}
	function down(e: PointerEvent) {
		if (e.button !== 0 || !lanes) return;
		// Select here: with pointer capture the click lands on the lanes, not the block.
		const el = (e.target as HTMLElement).closest<HTMLElement>('[data-seg],[data-audio]');
		if (el?.dataset.seg) editor.selected = { kind: 'segment', index: Number(el.dataset.seg) };
		else if (el?.dataset.audio) editor.selected = { kind: 'audio', id: el.dataset.audio };
		lanes.setPointerCapture(e.pointerId);
		editor.playing = false;
		editor.scrubbing = true;
		queue(e.clientX);
	}
	function move(e: PointerEvent) {
		if (lanes?.hasPointerCapture(e.pointerId)) queue(e.clientX);
	}
	function up(e: PointerEvent) {
		if (!lanes?.hasPointerCapture(e.pointerId)) return;
		lanes.releasePointerCapture(e.pointerId);
		editor.scrubbing = false;
	}
	$effect(() => () => cancelAnimationFrame(raf));

	// Keep the playhead in view while playing.
	$effect(() => {
		if (!editor.playing || !scroller || !lanes) return;
		const x = (editor.playhead / total) * lanes.clientWidth;
		const { scrollLeft, clientWidth } = scroller;
		if (x < scrollLeft || x > scrollLeft + clientWidth - 40) scroller.scrollLeft = x - 40;
	});

	function accepts(e: DragEvent) {
		const types = e.dataTransfer?.types ?? [];
		return types.includes('Files') || types.includes(CLIP_DRAG_TYPE);
	}
	function drop(e: DragEvent) {
		dropping = false;
		if (!accepts(e)) return;
		e.preventDefault();
		const time = timeAt(e.clientX);
		const at = segs.filter((s) => s.start + s.len / 2 < time).length;
		const clipId = e.dataTransfer?.getData(CLIP_DRAG_TYPE);
		if (clipId) return ondrop({ clipId, time, at });
		for (const file of e.dataTransfer?.files ?? []) ondrop({ file, time, at });
	}

	function fullscreen() {
		const el = document.getElementById('editor-preview');
		if (document.fullscreenElement) void document.exitFullscreen();
		else void el?.requestFullscreen();
	}

	const laneLabels = $derived([
		{ label: 'Video', h: 'h-7' },
		{ label: 'Original audio', h: 'h-7' },
		...t.audio.map((a) => ({ label: a.id.replace('-', ' '), h: 'h-7' })),
		{ label: 'Captions', h: 'h-10' },
		{ label: 'Text and blur', h: 'h-7' }
	]);
</script>

<div class="flex flex-col gap-2 rounded-lg border bg-surface p-3">
	<div class="flex items-center gap-1 text-xs text-muted-foreground">
		<Button
			size="icon-sm"
			variant="ghost"
			aria-label={editor.playing ? 'Pause' : 'Play'}
			onclick={() => (editor.playing = !editor.playing)}
		>
			{#if editor.playing}<PauseIcon />{:else}<PlayIcon />{/if}
		</Button>
		<span class="font-mono tabular-nums">
			<Timecode seconds={editor.playhead} /> / <Timecode seconds={editor.total} />
		</span>
		{#if editor.markIn !== null || editor.markOut !== null}
			<span class="ml-2">
				Marked
				<Timecode seconds={editor.markIn ?? 0} />–<Timecode
					seconds={editor.markOut ?? editor.total}
				/>
			</span>
		{/if}
		<span class="flex-1"></span>
		<Button
			size="icon-sm"
			variant="ghost"
			aria-label={editor.previewMuted ? 'Unmute preview' : 'Mute preview'}
			onclick={() => (editor.previewMuted = !editor.previewMuted)}
		>
			{#if editor.previewMuted || editor.volume === 0}<VolumeXIcon />{:else}<Volume2Icon />{/if}
		</Button>
		<input
			type="range"
			min="0"
			max="1"
			step="0.05"
			class="w-20 accent-primary"
			aria-label="Preview volume"
			bind:value={editor.volume}
			oninput={() => (editor.previewMuted = false)}
		/>
		<Button size="icon-sm" variant="ghost" aria-label="Full screen" onclick={fullscreen}>
			<MaximizeIcon />
		</Button>
	</div>

	<div class="grid grid-cols-[6rem_minmax(0,1fr)]">
		<div class="flex flex-col gap-1 pt-5">
			{#each laneLabels as l (l.label)}
				<div class="flex {l.h} items-center truncate pr-2 text-xs text-muted-foreground">
					{l.label}
				</div>
			{/each}
		</div>
		<!-- Scrolls sideways once the clip is longer than fits; scrollbar sits under the lanes. -->
		<div bind:this={scroller} class="overflow-x-auto pb-2">
			<div class="flex flex-col gap-1" style:width="max(100%, {total * PX_PER_S}px)">
				<div class="relative h-4 font-mono text-[11px] text-muted-foreground">
					{#each ticks as s (s)}
						<span class="absolute -translate-x-1/2 first:translate-x-0" style:left={pct(s)}
							>{s}s</span
						>
					{/each}
				</div>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					bind:this={lanes}
					class={cn(
						'relative flex cursor-text touch-none flex-col gap-1 rounded-sm select-none',
						dropping && 'ring-2 ring-primary'
					)}
					onpointerdown={down}
					onpointermove={move}
					onpointerup={up}
					onpointercancel={up}
					ondragover={(e) => {
						if (!accepts(e)) return;
						e.preventDefault();
						dropping = true;
					}}
					ondragleave={(e) => {
						if (!lanes?.contains(e.relatedTarget as Node)) dropping = false;
					}}
					ondrop={drop}
				>
					<div class="relative h-7">
						{#each segs as s (s.i)}
							<button
								type="button"
								data-seg={s.i}
								class={cn(
									'absolute inset-y-0 truncate rounded-sm border bg-elevated px-1.5 text-left text-xs',
									s.merged && 'bg-muted',
									editor.selected?.kind === 'segment' && editor.selected.index === s.i
										? 'border-primary'
										: 'border-border-strong'
								)}
								style:left={pct(s.start)}
								style:width={pct(s.len)}
								onclick={() => (editor.selected = { kind: 'segment', index: s.i })}
							>
								{s.i + 1}
							</button>
						{/each}
					</div>
					<div class="relative h-7">
						<div
							class={cn(
								'absolute inset-0 rounded-sm border border-border bg-elevated/60',
								t.originalAudio.muted && 'opacity-40'
							)}
						></div>
					</div>
					{#each t.audio as a (a.id)}
						{@const len = Math.min(editor.durations[a.key] ?? total, total - a.start)}
						<div class="relative h-7">
							<button
								type="button"
								data-audio={a.id}
								aria-label={a.id}
								class={cn(
									'absolute inset-y-0 rounded-sm border',
									a.kind === 'music' ? 'bg-success/15' : 'bg-info/15',
									a.muted && 'opacity-40',
									editor.selected?.kind === 'audio' && editor.selected.id === a.id
										? 'border-primary'
										: a.kind === 'music'
											? 'border-success/40'
											: 'border-info/40'
								)}
								style:left={pct(a.start)}
								style:width={pct(Math.max(len, 0.1))}
								onclick={() => (editor.selected = { kind: 'audio', id: a.id })}
							></button>
						</div>
					{/each}
					<!-- One caption track over the original audio: chunks come from the words of the
					     kept segments, so cutting/reordering the video moves the captions with it. -->
					<div
						class={cn(
							'relative h-10 overflow-hidden rounded-sm border border-caption/50 bg-caption/15',
							!t.captions.enabled && 'opacity-40'
						)}
					>
						<div class="truncate px-1.5 pt-0.5 text-[10px] font-medium text-caption">
							Captions for {sourceName}
						</div>
						{#each segs.slice(1) as s (s.i)}
							<div class="absolute inset-y-0 w-px bg-caption/50" style:left={pct(s.start)}></div>
						{/each}
						{#each chunks as c, i (i)}
							<div
								class="absolute bottom-0.5 h-4 truncate rounded-sm bg-caption/25 px-1 text-[10px] leading-4"
								style:left={pct(c.start)}
								style:width={pct(c.end - c.start)}
								title={c.text}
							>
								{c.text}
							</div>
						{/each}
					</div>
					<div class="relative h-7">
						{#each t.textOverlays as o, i (i)}
							<div
								class="absolute inset-y-1 truncate rounded-sm border border-border-strong px-1 text-[11px] leading-4"
								style:left={pct(o.start)}
								style:width={pct(o.end - o.start)}
							>
								{o.text}
							</div>
						{/each}
						{#each t.blurRegions as b, i (i)}
							<div
								class="absolute inset-y-1 rounded-sm border border-dashed border-border-strong px-1 text-[11px] leading-4 text-muted-foreground"
								style:left={pct(b.start)}
								style:width={pct(b.end - b.start)}
							>
								Blur
							</div>
						{/each}
					</div>
					{#if editor.markIn !== null || editor.markOut !== null}
						<div
							class="pointer-events-none absolute inset-y-0 bg-foreground/10"
							style:left={pct(editor.markIn ?? 0)}
							style:width={pct((editor.markOut ?? editor.total) - (editor.markIn ?? 0))}
						></div>
					{/if}
					<div
						class="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary"
						style:left={pct(editor.playhead)}
					></div>
				</div>
			</div>
		</div>
	</div>
</div>
