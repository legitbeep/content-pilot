<script lang="ts">
	// Approximate preview: one <video> plays the segments in order (swapping src between source
	// files), one <audio> per added track kept in sync, captions/overlays/blur drawn on top, aspect
	// as a CSS crop. The render is the truth.
	import { untrack } from 'svelte';
	import { captionChunks, locate, segmentKey, type Word } from '$lib/entities/timeline';
	import type { EditorState } from './editor-state.svelte';

	let { editor, wordsByKey }: { editor: EditorState; wordsByKey: Record<string, Word[]> } =
		$props();

	let video: HTMLVideoElement | undefined = $state();
	const audios: Record<string, HTMLAudioElement> = $state({});
	let frame = 0;
	/** Latest seek target. Only one seek is in flight; `pump` applies the newest when it lands,
	 * so fast scrubbing never queues stale seeks or stacks `loadedmetadata` handlers. */
	let want: { url: string; time: number } | null = null;

	const t = $derived(editor.timeline);
	const ratio = $derived({ '9:16': 9 / 16, '1:1': 1, '16:9': 16 / 9 }[t.aspect]);
	const chunks = $derived(t.captions.enabled ? captionChunks(t, wordsByKey) : []);
	const at = (r: { start: number; end: number }) =>
		editor.playhead >= r.start && editor.playhead < r.end;
	const caption = $derived(chunks.find(at));
	const overlays = $derived(t.textOverlays.filter(at));
	const blurs = $derived(t.blurRegions.filter(at));
	const look = $derived(t.captions.style.effect ?? 'outline');
	const fontSize = { small: 4, medium: 5.5, large: 7 };
	const place = { top: 'top-[8%]', center: 'top-1/2 -translate-y-1/2', bottom: 'bottom-[12%]' };

	function segStart(i: number) {
		return t.segments.slice(0, i).reduce((d, s) => d + s.end - s.start, 0);
	}

	function pump() {
		if (!video || !want) return;
		if (video.dataset.src !== want.url) {
			video.dataset.src = want.url;
			video.src = want.url; // loadedmetadata → pump again
			return;
		}
		if (video.readyState < 1 || video.seeking) return; // seeked → pump again
		if (Math.abs(video.currentTime - want.time) > 0.03) video.currentTime = want.time;
		want = null;
	}

	/** Point the video at output time `pos` (swapping source when needed). */
	function seekVideo(pos: number) {
		const { index, source } = locate(t, pos);
		const url = editor.urls[segmentKey(t, t.segments[index])];
		if (!url) return;
		want = { url, time: source };
		pump();
	}

	function syncAudio(force: boolean) {
		const ducked = t.ducking && !t.originalAudio.muted;
		const master = editor.previewMuted ? 0 : editor.volume;
		for (const tr of t.audio) {
			const el = audios[tr.id];
			if (!el) continue;
			el.muted = tr.muted || editor.previewMuted;
			el.volume = Math.min(1, tr.volume * master * (tr.kind === 'music' && ducked ? 0.35 : 1));
			const local = editor.playhead - tr.start;
			const inside = local >= 0 && (!el.duration || local < el.duration);
			if (inside && (force || Math.abs(el.currentTime - local) > 0.3)) el.currentTime = local;
			if (inside && editor.playing && el.paused) el.play().catch(() => {});
			if ((!inside || !editor.playing) && !el.paused) el.pause();
		}
		if (video) {
			video.muted = t.originalAudio.muted || editor.previewMuted;
			video.volume = Math.min(1, t.originalAudio.volume * master);
		}
	}

	function tick() {
		if (!video || !editor.playing) return;
		// Mid-seek (or mid-source-swap) currentTime is stale: don't let it move the playhead.
		if (want || video.seeking) {
			frame = requestAnimationFrame(tick);
			return;
		}
		const { index } = locate(t, editor.playhead);
		const seg = t.segments[index];
		if (video.currentTime >= seg.end - 0.04 || video.ended) {
			if (index === t.segments.length - 1) {
				editor.playing = false;
				editor.playhead = editor.total;
				video.pause();
				syncAudio(false);
				return;
			}
			editor.playhead = segStart(index + 1);
			seekVideo(editor.playhead);
			video.play().catch(() => {});
		} else if (video.currentTime >= seg.start) {
			editor.playhead = Math.min(editor.total, segStart(index) + video.currentTime - seg.start);
		}
		syncAudio(false);
		frame = requestAnimationFrame(tick);
	}

	// Play / pause.
	$effect(() => {
		const playing = editor.playing;
		if (!video) return;
		untrack(() => {
			if (playing) {
				if (editor.playhead >= editor.total - 0.05) editor.playhead = 0;
				seekVideo(editor.playhead);
				video!.play().catch(() => (editor.playing = false));
				syncAudio(true);
				frame = requestAnimationFrame(tick);
			} else {
				cancelAnimationFrame(frame);
				video!.pause();
				syncAudio(true);
			}
		});
	});

	// Seek while paused, and re-seek when the timeline changes. Scrubbing moves frames only;
	// audio catches up when the drag ends.
	$effect(() => {
		void t;
		void video;
		const pos = editor.playhead;
		const scrubbing = editor.scrubbing;
		if (!editor.playing)
			untrack(() => {
				seekVideo(pos);
				if (!scrubbing) syncAudio(true);
			});
	});

	// Preview volume / mute.
	$effect(() => {
		void editor.volume;
		void editor.previewMuted;
		untrack(() => syncAudio(false));
	});

	$effect(() => () => cancelAnimationFrame(frame));
</script>

<!-- Fits the chosen aspect inside the available space (letterboxed); fullscreen target. -->
<div
	id="editor-preview"
	class="flex size-full min-h-0 items-center justify-center [&:fullscreen]:bg-black"
	style:container-type="size"
>
	<!-- svelte-ignore a11y_click_events_have_key_events (Space toggles play, editorKeys) -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="relative cursor-pointer overflow-hidden rounded-lg border bg-black"
		style:width="min(100cqw, calc(100cqh * {ratio}))"
		style:aspect-ratio={ratio}
		style:container-type="size"
		onclick={() => (editor.playing = !editor.playing)}
	>
		<video
			bind:this={video}
			class="size-full object-cover"
			style:object-position="{t.cropX * 100}% 50%"
			playsinline
			preload="auto"
			onloadedmetadata={pump}
			onseeked={pump}
		></video>
		{#each blurs as b, i (i)}
			<!-- Soft radial edge, like the render's alpha fade. -->
			<div
				class="pointer-events-none absolute backdrop-blur-lg"
				style:left="{b.x * 100}%"
				style:top="{b.y * 100}%"
				style:width="{b.w * 100}%"
				style:height="{b.h * 100}%"
				style:mask-image="radial-gradient(closest-side, #000 50%, transparent 100%)"
			></div>
		{/each}
		{#each overlays as o, i (i)}
			<div
				class="pointer-events-none absolute inset-x-[6%] text-center font-semibold text-white {place[
					o.position
				]}"
				style:font-size="5cqh"
				style:text-shadow="0 0.3cqh 1cqh rgb(0 0 0 / 0.8)"
			>
				{o.text}
			</div>
		{/each}
		{#if caption}
			<div
				class="pointer-events-none absolute inset-x-[6%] text-center leading-tight font-bold {place[
					t.captions.style.position
				]}"
				style:color={t.captions.style.color}
				style:font-family={t.captions.style.font}
				style:font-size="{fontSize[t.captions.style.size]}cqh"
			>
				<span
					class="[box-decoration-break:clone]"
					style:-webkit-text-stroke={look === 'outline' ? '0.15cqh black' : undefined}
					style:paint-order="stroke fill"
					style:text-shadow={look === 'shadow' ? '0 0.4cqh 1.2cqh rgb(0 0 0 / 0.85)' : undefined}
					style:background={look === 'box' ? 'rgb(0 0 0 / 0.65)' : undefined}
					style:border-radius={look === 'box' ? '1cqh' : undefined}
					style:padding={look === 'box' ? '0.3cqh 1.2cqh' : undefined}
				>
					{caption.text}
				</span>
			</div>
		{/if}
	</div>
	{#each t.audio as tr (tr.id)}
		<audio
			bind:this={audios[tr.id]}
			src={editor.urls[tr.key]}
			preload="auto"
			onloadedmetadata={(e) => (editor.durations[tr.key] = e.currentTarget.duration)}
		></audio>
	{/each}
</div>
