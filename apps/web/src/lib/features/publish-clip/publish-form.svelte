<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { Button } from '$lib/shared/ui/button';
	import { Input } from '$lib/shared/ui/input';
	import { Label } from '$lib/shared/ui/label';
	import { Switch } from '$lib/shared/ui/switch';
	import { Textarea } from '$lib/shared/ui/textarea';
	import { formAction } from '$lib/shared/lib/form-action';
	import { platforms, type Platform } from '$lib/entities/post';
	import { toLocalInput, toUtcIso } from './time';

	type Caption = { title: string; description: string; tags: string[] };
	let {
		clip,
		youtube
	}: {
		clip: { id: string; captions: Record<Platform, Caption> };
		youtube: { account_name: string | null } | null;
	} = $props();

	// Editable copies of the prefilled captions; the parent re-mounts this per clip ({#key}).
	const yt = $derived(clip.captions.youtube);
	let title = $state('');
	let description = $state('');
	let tags = $state('');
	let enabled = $state<Record<Platform, boolean>>({
		youtube: true,
		instagram: false,
		linkedin: false,
		x: false
	});
	let mode = $state<'now' | 'schedule'>('now');
	let at = $state(toLocalInput(new Date(Date.now() + 60 * 60_000)));
	let busy = $state(false);
	$effect.pre(() => {
		title = yt.title;
		description = yt.description;
		tags = yt.tags.join(', ');
	});

	const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

	async function submit() {
		busy = true;
		try {
			await formAction('schedule', {
				clip_id: clip.id,
				title,
				caption: description,
				tags,
				scheduled_at: mode === 'now' ? '' : toUtcIso(at)
			});
			toast.success(
				mode === 'now' ? 'Posting to YouTube within a minute.' : 'Scheduled. See it in Calendar.'
			);
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not schedule the post.');
		} finally {
			busy = false;
		}
	}

	async function copy(text: string, name: string) {
		await navigator.clipboard.writeText(text);
		toast.success(`${name} caption copied.`);
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap gap-4">
		{#each platforms as p (p.id)}
			<label class="flex items-center gap-2">
				<Switch
					bind:checked={enabled[p.id]}
					disabled={p.id === 'youtube' && !youtube}
					aria-label={p.name}
				/>
				{p.name}
				{#if !p.autoPost}<span class="text-xs text-muted-foreground">Copy only</span>{/if}
			</label>
		{/each}
	</div>

	{#if enabled.youtube && youtube}
		<div class="flex flex-col gap-3 rounded-lg border p-4">
			<div class="flex items-center justify-between">
				<span class="font-medium">YouTube</span>
				<span class="text-xs text-muted-foreground"
					>as {youtube.account_name ?? 'your channel'}</span
				>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="yt-title">Title</Label>
				<Input id="yt-title" bind:value={title} maxlength={100} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="yt-desc">Description</Label>
				<Textarea id="yt-desc" bind:value={description} rows={5} maxlength={5000} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="yt-tags">Tags</Label>
				<Input id="yt-tags" bind:value={tags} placeholder="Comma separated" />
			</div>
			<div class="flex flex-wrap items-center gap-4">
				<label class="flex items-center gap-2">
					<input type="radio" bind:group={mode} value="now" class="accent-primary" /> Post now
				</label>
				<label class="flex items-center gap-2">
					<input type="radio" bind:group={mode} value="schedule" class="accent-primary" /> Schedule
				</label>
				{#if mode === 'schedule'}
					<Input type="datetime-local" bind:value={at} class="w-auto" aria-label="Date and time" />
					<span class="text-xs text-muted-foreground">{tz}</span>
				{/if}
			</div>
			<p class="text-xs text-muted-foreground">
				Uploads are private while our Google app is unverified. Make the video public in YouTube
				Studio.
			</p>
			<div>
				<Button onclick={submit} disabled={busy || !title.trim()}>
					{mode === 'now' ? 'Post now' : 'Schedule'}
				</Button>
			</div>
		</div>
	{:else if !youtube}
		<p class="rounded-lg border p-4 text-muted-foreground">
			Connect YouTube to post or schedule.
			<a href={resolve('/settings')} class="underline">Open Settings</a>
		</p>
	{/if}

	{#each platforms.filter((p) => !p.autoPost && enabled[p.id]) as p (p.id)}
		{@const text = clip.captions[p.id].description}
		<div class="flex flex-col gap-2 rounded-lg border p-4">
			<div class="flex items-center justify-between">
				<span class="font-medium">{p.name}</span>
				<Button variant="ghost" size="sm" onclick={() => copy(text, p.name)}>
					<CopyIcon /> Copy
				</Button>
			</div>
			<p class="whitespace-pre-wrap text-muted-foreground">{text}</p>
		</div>
	{/each}
</div>
