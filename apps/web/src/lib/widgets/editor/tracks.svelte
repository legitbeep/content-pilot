<script lang="ts">
	import { captionChunks, type Word } from '$lib/entities/timeline';
	import { Timecode } from '$lib/shared/ui/timecode';
	import { cn } from '$lib/shared/lib/utils';
	import type { EditorState } from './editor-state.svelte';

	let { editor, wordsByKey }: { editor: EditorState; wordsByKey: Record<string, Word[]> } =
		$props();

	let lanes: HTMLDivElement | undefined = $state();
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

	function seekTo(e: PointerEvent) {
		if (!lanes) return;
		const r = lanes.getBoundingClientRect();
		editor.playhead = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * editor.total;
	}
	function down(e: PointerEvent) {
		lanes?.setPointerCapture(e.pointerId);
		seekTo(e);
	}
	function move(e: PointerEvent) {
		if (lanes?.hasPointerCapture(e.pointerId)) seekTo(e);
	}
</script>

<div class="flex flex-col gap-2 rounded-lg border bg-surface p-3">
	<div class="flex items-center gap-3 text-xs text-muted-foreground">
		<span><Timecode seconds={editor.playhead} /> / <Timecode seconds={editor.total} /></span>
		{#if editor.markIn !== null || editor.markOut !== null}
			<span>
				Marked
				<Timecode seconds={editor.markIn ?? 0} />–<Timecode
					seconds={editor.markOut ?? editor.total}
				/>
			</span>
		{/if}
	</div>
	<div class="grid grid-cols-[6rem_1fr] items-center gap-y-1">
		<div></div>
		<div class="relative h-4 font-mono text-[11px] text-muted-foreground">
			{#each ticks as s (s)}
				<span class="absolute -translate-x-1/2" style:left={pct(s)}>{s}s</span>
			{/each}
		</div>
		<div class="col-span-2 grid grid-cols-subgrid">
			<div class="flex flex-col gap-1">
				{#each ['Video', 'Original audio', ...t.audio.map( (a) => a.id.replace('-', ' ') ), 'Captions', 'Text and blur'] as label (label)}
					<div class="flex h-7 items-center truncate pr-2 text-xs text-muted-foreground">
						{label}
					</div>
				{/each}
			</div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={lanes}
				class="relative flex cursor-text flex-col gap-1"
				onpointerdown={down}
				onpointermove={move}
			>
				<div class="relative h-7">
					{#each segs as s (s.i)}
						<button
							type="button"
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
				<div class={cn('relative h-7', !t.captions.enabled && 'opacity-40')}>
					{#each chunks as c, i (i)}
						<div
							class="absolute inset-y-1 truncate rounded-sm bg-muted px-1 text-[11px] leading-5"
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
