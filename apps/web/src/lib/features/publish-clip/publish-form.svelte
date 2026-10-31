<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { RequiresAI } from '$lib/entities/api-key';
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
	// "Generate captions" replaces `captions` with LLM copy; edits against it are logged.
	let captions = $state<Record<Platform, Caption>>(untrack(() => clip.captions));
	const yt = $derived(captions.youtube);
	let copyText = $state<Record<Platform, string>>({
		youtube: '',
		instagram: '',
		linkedin: '',
		x: ''
	});
	let generating = $state(false);
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
		for (const p of platforms) copyText[p.id] = captions[p.id].description;
	});

	async function generate() {
		generating = true;
		try {
			const r = await formAction<{ captions: Record<Platform, Caption> }>('captions', {
				clip_id: clip.id
			});
			captions = r.captions;
			toast.success('Captions written from your brand memory.');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not write captions.');
		} finally {
			generating = false;
		}
	}

	const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

	async function submit() {
		busy = true;
		try {
			await formAction('schedule', {
				clip_id: clip.id,
				title,
				caption: description,
				tags,
				scheduled_at: mode === 'now' ? '' : toUtcIso(at),
				before: JSON.stringify(yt)
			});
			toast.success(
				mode === 'now' ? 'Posting to YouTube within a minute.' : 'Scheduled. See it in Calendar.',
				{ action: { label: 'Open calendar', onClick: () => goto(resolve('/calendar')) } }
			);
			await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not schedule the post.');
		} finally {
			busy = false;
		}
	}

	async function copy(platform: Platform, name: string) {
		const text = copyText[platform];
		await navigator.clipboard.writeText(text);
		toast.success(`${name} caption copied.`);
		const before = captions[platform].description;
		if (text !== before)
			formAction('captionEdit', {
				clip_id: clip.id,
				platform,
				before: JSON.stringify({ description: before }),
				after: JSON.stringify({ description: text })
			}).catch(() => {}); // logging only; never bother the user
	}
</script>

<div class="flex flex-col gap-4">
	<div>
		<RequiresAI need="llm">
			{#snippet children({ disabled })}
				<Button variant="outline" onclick={generate} disabled={disabled || generating}>
					<SparklesIcon />
					{generating ? 'Writing captions…' : 'Generate captions'}
				</Button>
			{/snippet}
		</RequiresAI>
	</div>
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
		<div class="flex flex-col gap-2 rounded-lg border p-4">
			<div class="flex items-center justify-between">
				<Label for="copy-{p.id}" class="font-medium">{p.name}</Label>
				<Button variant="ghost" size="sm" onclick={() => copy(p.id, p.name)}>
					<CopyIcon /> Copy
				</Button>
			</div>
			<Textarea
				id="copy-{p.id}"
				bind:value={copyText[p.id]}
				rows={4}
				maxlength={p.id === 'x' ? 280 : undefined}
			/>
			{#if p.id === 'x'}
				<span class="text-xs text-muted-foreground">{copyText.x.length}/280</span>
			{/if}
		</div>
	{/each}
</div>
