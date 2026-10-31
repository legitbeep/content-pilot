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

	const t = $derived(editor.timeline);
	const ratio = $derived({ '9:16': '9 / 16', '1:1': '1 / 1', '16:9': '16 / 9' }[t.aspect]);
	const chunks = $derived(t.captions.enabled ? captionChunks(t, wordsByKey) : []);
	const at = (r: { start: number; end: number }) =>
		editor.playhead >= r.start && editor.playhead < r.end;
	const caption = $derived(chunks.find(at));
	const overlays = $derived(t.textOverlays.filter(at));
	const blurs = $derived(t.blurRegions.filter(at));
	const fontSize = { small: 4, medium: 5.5, large: 7 };
	const place = { top: 'top-[8%]', center: 'top-1/2 -translate-y-1/2', bottom: 'bottom-[12%]' };

	function segStart(i: number) {
		return t.segments.slice(0, i).reduce((d, s) => d + s.end - s.start, 0);
	}

	/** Point the video at output time `pos` (swapping source when needed). */
	function seekVideo(pos: number) {
		if (!video) return;
		const { index, source } = locate(t, pos);
		const url = editor.urls[segmentKey(t, t.segments[index])];
		if (!url) return;
		if (video.dataset.src !== url) {
			video.dataset.src = url;
			video.src = url;
			video.addEventListener('loadedmetadata', () => (video!.currentTime = source), { once: true });
		} else if (Math.abs(video.currentTime - source) > 0.05) {
			video.currentTime = source;
		}
	}

	function syncAudio(force: boolean) {
		const ducked = t.ducking && !t.originalAudio.muted;
		for (const tr of t.audio) {
			const el = audios[tr.id];
			if (!el) continue;
			el.muted = tr.muted;
			el.volume = Math.min(1, tr.volume * (tr.kind === 'music' && ducked ? 0.35 : 1));
			const local = editor.playhead - tr.start;
			const inside = local >= 0 && (!el.duration || local < el.duration);
			if (inside && (force || Math.abs(el.currentTime - local) > 0.3)) el.currentTime = local;
			if (inside && editor.playing && el.paused) el.play().catch(() => {});
			if ((!inside || !editor.playing) && !el.paused) el.pause();
		}
		if (video) {
			video.muted = t.originalAudio.muted;
			video.volume = Math.min(1, t.originalAudio.volume);
		}
	}

	function tick() {
		if (!video || !editor.playing) return;
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

	// Seek while paused, and re-seek when the timeline changes.
	$effect(() => {
		void t;
		void video;
		const pos = editor.playhead;
		if (!editor.playing) untrack(() => (seekVideo(pos), syncAudio(true)));
	});

	$effect(() => () => cancelAnimationFrame(frame));
</script>

<div class="flex h-full min-h-0 items-center justify-center">
	<div
		class="relative h-full max-h-full max-w-full overflow-hidden rounded-lg border bg-black"
		style:aspect-ratio={ratio}
		style:container-type="size"
	>
		<video
			bind:this={video}
			class="size-full object-cover"
			style:object-position="{t.cropX * 100}% 50%"
			playsinline
			preload="auto"
		></video>
		{#each blurs as b, i (i)}
			<div
				class="absolute backdrop-blur-lg"
				style:left="{b.x * 100}%"
				style:top="{b.y * 100}%"
				style:width="{b.w * 100}%"
				style:height="{b.h * 100}%"
			></div>
		{/each}
		{#each overlays as o, i (i)}
			<div
				class="absolute inset-x-[6%] text-center font-semibold text-white {place[o.position]}"
				style:font-size="5cqh"
				style:text-shadow="0 0 4px black"
			>
				{o.text}
			</div>
		{/each}
		{#if caption}
			<div
				class="absolute inset-x-[6%] text-center leading-tight font-bold {place[
					t.captions.style.position
				]}"
				style:color={t.captions.style.color}
				style:font-family={t.captions.style.font}
				style:font-size="{fontSize[t.captions.style.size]}cqh"
				style:-webkit-text-stroke="0.15cqh black"
				style:paint-order="stroke fill"
			>
				{caption.text}
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
