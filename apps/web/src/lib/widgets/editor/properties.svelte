<script lang="ts">
	// Right panel: the selected segment/track on top, then clip-wide settings in tabs.
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import FilmIcon from '@lucide/svelte/icons/film';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import MicIcon from '@lucide/svelte/icons/mic';
	import MusicIcon from '@lucide/svelte/icons/music';
	import TypeIcon from '@lucide/svelte/icons/type';
	import XIcon from '@lucide/svelte/icons/x';
	import type { Aspect } from '$lib/entities/timeline';
	import { Button } from '$lib/shared/ui/button';
	import { Input } from '$lib/shared/ui/input';
	import { Label } from '$lib/shared/ui/label';
	import { Slider } from '$lib/shared/ui/slider';
	import { Switch } from '$lib/shared/ui/switch';
	import * as Select from '$lib/shared/ui/select';
	import * as Tabs from '$lib/shared/ui/tabs';
	import type { EditorState } from './editor-state.svelte';
	import ToolButton from './tool-button.svelte';

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

	const uploads = [
		{ kind: 'voiceover', label: 'Voiceover', icon: MicIcon },
		{ kind: 'music', label: 'Music', icon: MusicIcon },
		{ kind: 'video', label: 'Video', icon: FilmIcon }
	] as const;

	let tab = $state('format');
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

{#snippet heading(title: string)}
	<h3 class="text-xs font-medium text-muted-foreground">{title}</h3>
{/snippet}

{#snippet slider(label: string, value: number, max: number, commit: (v: number) => void)}
	<div class="grid gap-2">
		<div class="flex items-center justify-between text-xs">
			<span>{label}</span>
			<span class="text-muted-foreground tabular-nums">{Math.round(value)}%</span>
		</div>
		<Slider type="single" {value} {max} step={max > 100 ? 5 : 1} onValueCommit={commit} />
	</div>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col text-sm">
	{#if (seg && sel?.kind === 'segment') || track}
		<div class="flex animate-in-fade flex-col gap-3 border-b bg-gradient-surface p-3">
			<div class="flex items-center justify-between gap-2">
				<h3 class="text-sm font-medium first-letter:uppercase">
					{#if seg && sel?.kind === 'segment'}
						Segment {sel.index + 1}{seg.sourceKey ? ' (other clip)' : ''}
					{:else if track}
						{track.id.replace('-', ' ')}
					{/if}
				</h3>
				<ToolButton label="Clear selection" size="icon-xs" onclick={() => (editor.selected = null)}>
					<XIcon />
				</ToolButton>
			</div>
			{#if seg && sel?.kind === 'segment'}
				<div class="grid grid-cols-2 gap-2">
					<div class="grid gap-1.5">
						<Label for="seg-in" class="text-xs font-normal">In (s)</Label>
						<Input
							id="seg-in"
							type="number"
							step="0.1"
							min="0"
							value={seg.start}
							onchange={(e) => editor.apply('trim', { segment: sel.index, start: num(e) })}
						/>
					</div>
					<div class="grid gap-1.5">
						<Label for="seg-out" class="text-xs font-normal">Out (s)</Label>
						<Input
							id="seg-out"
							type="number"
							step="0.1"
							min="0"
							max={editor.durations[seg.sourceKey ?? t.sourceKey]}
							value={seg.end}
							onchange={(e) => editor.apply('trim', { segment: sel.index, end: num(e) })}
						/>
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={sel.index === 0}
						onclick={() => {
							if (editor.apply('reorder', { from: sel.index, to: sel.index - 1 }))
								editor.selected = { kind: 'segment', index: sel.index - 1 };
						}}><ArrowLeftIcon />Earlier</Button
					>
					<Button
						size="sm"
						variant="outline"
						disabled={sel.index === t.segments.length - 1}
						onclick={() => {
							if (editor.apply('reorder', { from: sel.index, to: sel.index + 1 }))
								editor.selected = { kind: 'segment', index: sel.index + 1 };
						}}><ArrowRightIcon />Later</Button
					>
					<Button
						size="sm"
						variant="outline"
						class="ml-auto text-danger hover:text-danger"
						onclick={() => {
							if (editor.apply('delete_range', segOutput(sel.index))) editor.selected = null;
						}}>Delete</Button
					>
				</div>
			{:else if track}
				<Label class="justify-between text-xs font-normal">
					Muted
					<Switch
						checked={track.muted}
						onCheckedChange={(v) => editor.apply('mute_track', { track: track.id, muted: v })}
					/>
				</Label>
				{@render slider('Volume', track.volume * 100, 200, (v) =>
					editor.apply('set_volume', { track: track.id, volume: v / 100 })
				)}
				<div class="flex items-center justify-between text-xs">
					<span class="text-muted-foreground">Starts at</span>
					<span class="font-mono tabular-nums">{track.start.toFixed(1)}s</span>
				</div>
				<Button
					size="sm"
					variant="outline"
					class="self-start text-danger hover:text-danger"
					onclick={() => {
						if (editor.apply('remove_audio', { track: track.id })) editor.selected = null;
					}}>Remove track</Button
				>
			{/if}
		</div>
	{/if}

	<Tabs.Root bind:value={tab} class="min-h-0 flex-1 gap-0">
		<div class="border-b px-2">
			<Tabs.List variant="line" class="w-full">
				<Tabs.Trigger value="format">Format</Tabs.Trigger>
				<Tabs.Trigger value="audio">Audio</Tabs.Trigger>
				<Tabs.Trigger value="captions">Captions</Tabs.Trigger>
				<Tabs.Trigger value="text">Text</Tabs.Trigger>
			</Tabs.List>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto p-3">
			<Tabs.Content value="format" class="flex animate-in-fade flex-col gap-4">
				<div class="grid gap-1.5">
					<Label class="text-xs font-normal">Aspect ratio</Label>
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
				</div>
				{@render slider('Crop position', t.cropX * 100, 100, (v) =>
					editor.apply('set_crop_offset', { x: v / 100 })
				)}
			</Tabs.Content>

			<Tabs.Content value="audio" class="flex animate-in-fade flex-col gap-4">
				<Label class="justify-between text-xs font-normal">
					Mute original audio
					<Switch
						checked={t.originalAudio.muted}
						onCheckedChange={(v) => editor.apply('mute_track', { track: 'original', muted: v })}
					/>
				</Label>
				{@render slider('Original volume', t.originalAudio.volume * 100, 200, (v) =>
					editor.apply('set_volume', { track: 'original', volume: v / 100 })
				)}
				<Label class="justify-between text-xs font-normal">
					Lower music under speech
					<Switch
						checked={t.ducking}
						onCheckedChange={(v) => editor.apply('set_ducking', { enabled: v })}
					/>
				</Label>
				<div class="grid gap-2">
					{@render heading('Add media')}
					<div class="grid grid-cols-3 gap-2">
						{#each uploads as u (u.kind)}
							<input
								bind:this={inputs[u.kind]}
								type="file"
								accept={u.kind === 'video' ? 'video/*' : 'audio/*'}
								hidden
								onchange={(e) => {
									const f = e.currentTarget.files?.[0];
									if (f) onupload(u.kind, f);
									e.currentTarget.value = '';
								}}
							/>
							<Button
								size="sm"
								variant="outline"
								disabled={!!uploading}
								aria-label="Add {u.label.toLowerCase()}"
								onclick={() => inputs[u.kind]?.click()}
							>
								{#if uploading === u.kind}<LoaderCircleIcon class="animate-spin" />{:else}<u.icon
									/>{/if}
								{u.label}
							</Button>
						{/each}
					</div>
				</div>
			</Tabs.Content>

			<Tabs.Content value="captions" class="flex animate-in-fade flex-col gap-4">
				<Label class="justify-between text-xs font-normal">
					Burn in captions
					<Switch
						checked={t.captions.enabled}
						onCheckedChange={(v) => editor.apply('toggle_captions', { enabled: v })}
					/>
				</Label>
				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-1.5">
						<Label class="text-xs font-normal">Position</Label>
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
					</div>
					<div class="grid gap-1.5">
						<Label class="text-xs font-normal">Size</Label>
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
					</div>
					<div class="grid gap-1.5">
						<Label class="text-xs font-normal">Words per caption</Label>
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
					</div>
					<div class="grid gap-1.5">
						<Label class="text-xs font-normal">Effect</Label>
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
					</div>
				</div>
				<Label class="justify-between text-xs font-normal">
					Colour
					<span class="flex items-center gap-2">
						<input
							type="color"
							class="size-7 cursor-pointer rounded-md border bg-subtle p-0.5 transition-colors hover:border-border-strong"
							value={t.captions.style.color}
							onchange={(e) =>
								editor.apply('set_caption_style', { color: e.currentTarget.value.toUpperCase() })}
						/>
					</span>
				</Label>
			</Tabs.Content>

			<Tabs.Content value="text" class="flex animate-in-fade flex-col gap-4">
				<div class="grid gap-1.5">
					<Label for="overlay-text" class="text-xs font-normal">Text on screen</Label>
					<Input
						id="overlay-text"
						placeholder="Type a title or a callout"
						bind:value={overlayText}
						maxlength={200}
					/>
				</div>
				<div class="flex gap-2">
					<Select.Root type="single" bind:value={overlayPosition}>
						<Select.Trigger class="w-28" aria-label="Text position">
							{cap(overlayPosition)}
						</Select.Trigger>
						<Select.Content>
							{#each positions as p (p)}<Select.Item value={p}>{cap(p)}</Select.Item>{/each}
						</Select.Content>
					</Select.Root>
					<Button
						size="sm"
						variant="outline"
						class="flex-1"
						disabled={!overlayText.trim()}
						onclick={() => {
							const ok = editor.apply('add_text_overlay', {
								...atPlayhead(),
								text: overlayText.trim(),
								position: overlayPosition
							});
							if (ok) overlayText = '';
						}}><TypeIcon />Add at playhead</Button
					>
				</div>
				<div class="grid gap-1.5 border-t pt-4">
					{@render heading('Blur')}
					<Button
						size="sm"
						variant="outline"
						class="self-start"
						onclick={() =>
							editor.apply('blur_region', { ...atPlayhead(), x: 0.3, y: 0.4, w: 0.4, h: 0.2 })}
						><EyeOffIcon />Blur centre for 3s</Button
					>
				</div>
			</Tabs.Content>
		</div>
	</Tabs.Root>
</div>
