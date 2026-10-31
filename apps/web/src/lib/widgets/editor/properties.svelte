<script lang="ts">
	import type { Aspect } from '$lib/entities/timeline';
	import { Button } from '$lib/shared/ui/button';
	import { Input } from '$lib/shared/ui/input';
	import { Label } from '$lib/shared/ui/label';
	import { Slider } from '$lib/shared/ui/slider';
	import { Switch } from '$lib/shared/ui/switch';
	import * as Select from '$lib/shared/ui/select';
	import type { EditorState } from './editor-state.svelte';

	type UploadKind = 'voiceover' | 'music' | 'video';
	let {
		editor,
		onupload,
		uploading
	}: {
		editor: EditorState;
		onupload: (kind: UploadKind, file: File) => void;
		uploading: UploadKind | null;
	} = $props();

	const t = $derived(editor.timeline);
	const sel = $derived(editor.selected);
	const seg = $derived(sel?.kind === 'segment' ? t.segments[sel.index] : undefined);
	const track = $derived(sel?.kind === 'audio' ? t.audio.find((a) => a.id === sel.id) : undefined);

	const aspects: { value: Aspect; label: string }[] = [
		{ value: '9:16', label: '9:16 - YouTube Shorts, Reels, TikTok' },
		{ value: '1:1', label: '1:1 - Instagram feed, LinkedIn' },
		{ value: '16:9', label: '16:9 - YouTube, X' }
	];
	const positions = ['top', 'center', 'bottom'] as const;
	const sizes = ['small', 'medium', 'large'] as const;
	const effects = { outline: 'Outline', shadow: 'Soft shadow', box: 'Background box' } as const;
	const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

	let overlayText = $state('');
	let overlayPosition: (typeof positions)[number] = $state('top');
	const inputs: Partial<Record<UploadKind, HTMLInputElement>> = $state({});

	function segOutput(i: number) {
		const start = t.segments.slice(0, i).reduce((d, s) => d + s.end - s.start, 0);
		return { start, end: start + t.segments[i].end - t.segments[i].start };
	}
	const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);
	const atPlayhead = () => {
		const start = Math.min(editor.playhead, Math.max(0, editor.total - 0.5));
		return { start, end: Math.min(editor.total, start + 3) };
	};
</script>

{#snippet section(title: string)}
	<h3 class="text-xs font-medium text-muted-foreground">{title}</h3>
{/snippet}

<div class="flex flex-col gap-5 text-sm">
	{#if seg && sel?.kind === 'segment'}
		<div class="flex flex-col gap-2">
			{@render section(`Segment ${sel.index + 1}${seg.sourceKey ? ' (other clip)' : ''}`)}
			<div class="grid grid-cols-2 gap-2">
				<Label class="flex flex-col items-start gap-1 text-xs">
					In (s)
					<Input
						type="number"
						step="0.1"
						min="0"
						value={seg.start}
						onchange={(e) => editor.apply('trim', { segment: sel.index, start: num(e) })}
					/>
				</Label>
				<Label class="flex flex-col items-start gap-1 text-xs">
					Out (s)
					<Input
						type="number"
						step="0.1"
						min="0"
						max={editor.durations[seg.sourceKey ?? t.sourceKey]}
						value={seg.end}
						onchange={(e) => editor.apply('trim', { segment: sel.index, end: num(e) })}
					/>
				</Label>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="outline"
					disabled={sel.index === 0}
					onclick={() => {
						if (editor.apply('reorder', { from: sel.index, to: sel.index - 1 }))
							editor.selected = { kind: 'segment', index: sel.index - 1 };
					}}>Move earlier</Button
				>
				<Button
					size="sm"
					variant="outline"
					disabled={sel.index === t.segments.length - 1}
					onclick={() => {
						if (editor.apply('reorder', { from: sel.index, to: sel.index + 1 }))
							editor.selected = { kind: 'segment', index: sel.index + 1 };
					}}>Move later</Button
				>
				<Button
					size="sm"
					variant="outline"
					class="text-danger"
					onclick={() => {
						if (editor.apply('delete_range', segOutput(sel.index))) editor.selected = null;
					}}>Delete</Button
				>
			</div>
		</div>
	{:else if track}
		<div class="flex flex-col gap-2">
			{@render section(cap(track.id.replace('-', ' ')))}
			<Label class="flex items-center gap-2 text-xs">
				<Switch
					checked={track.muted}
					onCheckedChange={(v) => editor.apply('mute_track', { track: track.id, muted: v })}
				/>
				Muted
			</Label>
			<span class="text-xs text-muted-foreground">Volume {Math.round(track.volume * 100)}%</span>
			<Slider
				type="single"
				value={track.volume * 100}
				max={200}
				step={5}
				onValueCommit={(v) => editor.apply('set_volume', { track: track.id, volume: v / 100 })}
			/>
			<Label class="flex flex-col items-start gap-1 text-xs">
				Starts at (s)
				<Input type="number" step="0.1" min="0" value={track.start} disabled />
			</Label>
			<Button
				size="sm"
				variant="outline"
				class="self-start text-danger"
				onclick={() => {
					if (editor.apply('remove_audio', { track: track.id })) editor.selected = null;
				}}>Remove track</Button
			>
		</div>
	{/if}

	<div class="flex flex-col gap-2">
		{@render section('Format')}
		<Select.Root
			type="single"
			value={t.aspect}
			onValueChange={(v) => editor.apply('set_aspect', { aspect: v })}
		>
			<Select.Trigger class="w-full" aria-label="Aspect ratio">
				{aspects.find((a) => a.value === t.aspect)?.label}
			</Select.Trigger>
			<Select.Content>
				{#each aspects as a (a.value)}
					<Select.Item value={a.value}>{a.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<span class="text-xs text-muted-foreground">Crop position</span>
		<Slider
			type="single"
			value={t.cropX * 100}
			max={100}
			step={1}
			onValueCommit={(v) => editor.apply('set_crop_offset', { x: v / 100 })}
		/>
	</div>

	<div class="flex flex-col gap-2">
		{@render section('Audio')}
		<Label class="flex items-center gap-2 text-xs">
			<Switch
				checked={t.originalAudio.muted}
				onCheckedChange={(v) => editor.apply('mute_track', { track: 'original', muted: v })}
			/>
			Mute original audio
		</Label>
		<span class="text-xs text-muted-foreground">
			Original volume {Math.round(t.originalAudio.volume * 100)}%
		</span>
		<Slider
			type="single"
			value={t.originalAudio.volume * 100}
			max={200}
			step={5}
			onValueCommit={(v) => editor.apply('set_volume', { track: 'original', volume: v / 100 })}
		/>
		<Label class="flex items-center gap-2 text-xs">
			<Switch
				checked={t.ducking}
				onCheckedChange={(v) => editor.apply('set_ducking', { enabled: v })}
			/>
			Lower music under speech
		</Label>
		<div class="flex flex-wrap gap-2">
			{#each [['voiceover', 'Add voiceover'], ['music', 'Add music'], ['video', 'Add video file']] as const as [kind, label] (kind)}
				<input
					bind:this={inputs[kind]}
					type="file"
					accept={kind === 'video' ? 'video/*' : 'audio/*'}
					hidden
					onchange={(e) => {
						const f = e.currentTarget.files?.[0];
						if (f) onupload(kind, f);
						e.currentTarget.value = '';
					}}
				/>
				<Button
					size="sm"
					variant="outline"
					disabled={!!uploading}
					onclick={() => inputs[kind]?.click()}
				>
					{uploading === kind ? 'Uploading…' : label}
				</Button>
			{/each}
		</div>
	</div>

	<div class="flex flex-col gap-2">
		{@render section('Captions')}
		<Label class="flex items-center gap-2 text-xs">
			<Switch
				checked={t.captions.enabled}
				onCheckedChange={(v) => editor.apply('toggle_captions', { enabled: v })}
			/>
			Burn in captions
		</Label>
		<div class="grid grid-cols-2 gap-2">
			<Select.Root
				type="single"
				value={t.captions.style.position}
				onValueChange={(v) => editor.apply('set_caption_style', { position: v })}
			>
				<Select.Trigger class="w-full" aria-label="Caption position">
					{cap(t.captions.style.position)}
				</Select.Trigger>
				<Select.Content>
					{#each positions as p (p)}<Select.Item value={p}>{cap(p)}</Select.Item>{/each}
				</Select.Content>
			</Select.Root>
			<Select.Root
				type="single"
				value={t.captions.style.size}
				onValueChange={(v) => editor.apply('set_caption_style', { size: v })}
			>
				<Select.Trigger class="w-full" aria-label="Caption size">
					{cap(t.captions.style.size)}
				</Select.Trigger>
				<Select.Content>
					{#each sizes as s (s)}<Select.Item value={s}>{cap(s)}</Select.Item>{/each}
				</Select.Content>
			</Select.Root>
			<Select.Root
				type="single"
				value={String(t.captions.style.wordsPerChunk)}
				onValueChange={(v) => editor.apply('set_caption_style', { wordsPerChunk: Number(v) })}
			>
				<Select.Trigger class="w-full" aria-label="Words per caption">
					{t.captions.style.wordsPerChunk} words
				</Select.Trigger>
				<Select.Content>
					{#each [1, 2, 3, 4, 5] as n (n)}
						<Select.Item value={String(n)}>{n} words</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Select.Root
				type="single"
				value={t.captions.style.effect ?? 'outline'}
				onValueChange={(v) => editor.apply('set_caption_style', { effect: v })}
			>
				<Select.Trigger class="w-full" aria-label="Caption effect">
					{effects[t.captions.style.effect ?? 'outline']}
				</Select.Trigger>
				<Select.Content>
					{#each Object.entries(effects) as [value, label] (value)}
						<Select.Item {value}>{label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Label class="flex items-center gap-2 text-xs">
				<input
					type="color"
					class="size-8 rounded-sm border bg-transparent"
					value={t.captions.style.color}
					onchange={(e) =>
						editor.apply('set_caption_style', { color: e.currentTarget.value.toUpperCase() })}
				/>
				Colour
			</Label>
		</div>
	</div>

	<div class="flex flex-col gap-2">
		{@render section('Text and blur')}
		<Input placeholder="Text on screen" bind:value={overlayText} maxlength={200} />
		<div class="flex flex-wrap gap-2">
			<Select.Root type="single" bind:value={overlayPosition}>
				<Select.Trigger class="w-28" aria-label="Text position"
					>{cap(overlayPosition)}</Select.Trigger
				>
				<Select.Content>
					{#each positions as p (p)}<Select.Item value={p}>{cap(p)}</Select.Item>{/each}
				</Select.Content>
			</Select.Root>
			<Button
				size="sm"
				variant="outline"
				disabled={!overlayText.trim()}
				onclick={() => {
					const ok = editor.apply('add_text_overlay', {
						...atPlayhead(),
						text: overlayText.trim(),
						position: overlayPosition
					});
					if (ok) overlayText = '';
				}}>Add text at playhead</Button
			>
		</div>
		<Button
			size="sm"
			variant="outline"
			class="self-start"
			onclick={() =>
				editor.apply('blur_region', { ...atPlayhead(), x: 0.3, y: 0.4, w: 0.4, h: 0.2 })}
			>Blur centre for 3s</Button
		>
	</div>
</div>
