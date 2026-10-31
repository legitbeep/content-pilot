<!-- Docs: docs/brand-memory.md
The fields of one brand profile section. Edits `profile` in place; the page saves it (onboarding
step or /brand section). The logo upload calls the page's ?/logo action, then PUTs to R2. -->
<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { CAPTION_FONTS, LANGUAGES, type BrandProfile } from '$lib/entities/brand';
	import { formAction } from '$lib/shared/lib/form-action';
	import { Button } from '$lib/shared/ui/button';
	import { ChipsInput } from '$lib/shared/ui/chips-input';
	import { Input } from '$lib/shared/ui/input';
	import { Label } from '$lib/shared/ui/label';
	import * as Select from '$lib/shared/ui/select';
	import { Slider } from '$lib/shared/ui/slider';
	import { Textarea } from '$lib/shared/ui/textarea';
	import type { Section } from './sections';

	let {
		section,
		profile = $bindable(),
		logoUrl = null
	}: { section: Section; profile: BrandProfile; logoUrl?: string | null } = $props();

	const tones = [
		['casual_formal', 'Casual', 'Formal'],
		['funny_serious', 'Funny', 'Serious'],
		['bold_humble', 'Bold', 'Humble']
	] as const;

	let logoPreview = $state<string | null>(null);
	let logoBusy = $state(false);
	let logoError = $state('');

	async function uploadLogo(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		logoBusy = true;
		logoError = '';
		try {
			const { url, path } = await formAction<{ url: string; path: string }>('logo', {
				type: file.type,
				size: file.size
			});
			const res = await fetch(url, { method: 'PUT', body: file });
			if (!res.ok) throw new Error(`Upload failed (${res.status}).`);
			profile.logo_path = path;
			logoPreview = URL.createObjectURL(file);
		} catch (err) {
			logoError = err instanceof Error ? err.message : 'Upload failed.';
		} finally {
			logoBusy = false;
		}
	}

	const setList = (k: 'example_posts' | 'disliked_posts', i: number, v: string) => {
		const xs = [...profile[k]];
		xs[i] = v;
		profile[k] = xs;
	};
	const exampleSlots = $derived(Math.min(Math.max(profile.example_posts.length, 3), 5));
	let extraExample = $state(0);
	const dislikedSlots = $derived(Math.max(profile.disliked_posts.length, 1));
	let extraDisliked = $state(0);
</script>

<div class="flex flex-col gap-5">
	{#if section === 'basics'}
		<div class="flex flex-col gap-1.5">
			<Label for="name">Brand name</Label>
			<Input id="name" bind:value={profile.name} maxlength={80} required />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="one_liner">One-line description</Label>
			<Input
				id="one_liner"
				bind:value={profile.one_liner}
				maxlength={200}
				placeholder="Coding explained over chai, for first-job developers"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="niche">Niche</Label>
			<Input id="niche" bind:value={profile.niche} maxlength={80} placeholder="Programming" />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="language">Content language</Label>
			<Input id="language" bind:value={profile.language} list="languages" maxlength={40} />
			<datalist id="languages">
				{#each LANGUAGES as l (l)}<option value={l}></option>{/each}
			</datalist>
		</div>
	{:else if section === 'audience'}
		<div class="flex flex-col gap-1.5">
			<Label for="audience">Who they are and what they care about</Label>
			<Textarea
				id="audience"
				bind:value={profile.audience}
				maxlength={600}
				rows={5}
				placeholder="Students and early-career developers in India. They want a first job, clear explanations and no fluff."
			/>
		</div>
	{:else if section === 'content'}
		<div class="flex flex-col gap-1.5">
			<Label>Core topics, up to 5</Label>
			<ChipsInput bind:value={profile.core_topics} max={5} label="Add a core topic" />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label>Off-limits topics</Label>
			<ChipsInput bind:value={profile.off_limits_topics} label="Add an off-limits topic" />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label>Banned words and phrases</Label>
			<ChipsInput bind:value={profile.banned_words} max={50} label="Add a banned word" />
		</div>
	{:else if section === 'voice'}
		<div class="flex flex-col gap-4">
			{#each tones as [key, left, right] (key)}
				<div class="flex flex-col gap-2">
					<div class="flex justify-between text-xs text-muted-foreground">
						<span>{left}</span><span>{right}</span>
					</div>
					<Slider
						type="single"
						bind:value={profile.tone[key]}
						min={0}
						max={100}
						step={5}
						aria-label={`${left} to ${right}`}
					/>
				</div>
			{/each}
		</div>
		<div class="flex flex-col gap-1.5">
			<Label>Posts that sound like you, 3 to 5</Label>
			<p class="text-xs text-muted-foreground">Paste a title, caption or script as text.</p>
			{#each { length: Math.min(exampleSlots + extraExample, 5) }, i (i)}
				<Textarea
					value={profile.example_posts[i] ?? ''}
					oninput={(e) => setList('example_posts', i, e.currentTarget.value)}
					rows={3}
					maxlength={3000}
					aria-label={`Example post ${i + 1}`}
				/>
			{/each}
			{#if exampleSlots + extraExample < 5}
				<Button variant="ghost" size="sm" class="self-start" onclick={() => extraExample++}>
					Add another
				</Button>
			{/if}
		</div>
		<div class="flex flex-col gap-1.5">
			<Label>Posts you don't want to sound like, optional</Label>
			{#each { length: Math.min(dislikedSlots + extraDisliked, 2) }, i (i)}
				<Textarea
					value={profile.disliked_posts[i] ?? ''}
					oninput={(e) => setList('disliked_posts', i, e.currentTarget.value)}
					rows={3}
					maxlength={3000}
					aria-label={`Disliked post ${i + 1}`}
				/>
			{/each}
			{#if dislikedSlots + extraDisliked < 2}
				<Button variant="ghost" size="sm" class="self-start" onclick={() => extraDisliked++}>
					Add another
				</Button>
			{/if}
		</div>
	{:else if section === 'visual'}
		<div class="flex flex-col gap-1.5">
			<Label for="logo">Logo</Label>
			<div class="flex items-center gap-3">
				{#if logoPreview || logoUrl}
					<img
						src={logoPreview ?? logoUrl}
						alt="Your logo"
						class="size-12 rounded-sm border object-contain"
					/>
				{:else if profile.logo_path}
					<span class="text-xs text-muted-foreground">Logo uploaded</span>
				{/if}
				<Input
					id="logo"
					type="file"
					accept="image/png,image/jpeg,image/webp"
					onchange={uploadLogo}
					disabled={logoBusy}
				/>
			</div>
			{#if logoBusy}<p class="text-xs text-muted-foreground">Uploading…</p>{/if}
			{#if logoError}<p class="text-xs text-danger">{logoError}</p>{/if}
		</div>
		<div class="flex flex-col gap-1.5">
			<Label>Brand colors, up to 5</Label>
			<div class="flex flex-wrap items-center gap-2">
				{#each profile.colors as c, i (i)}
					<span class="inline-flex items-center gap-1 rounded-sm border p-1">
						<input
							type="color"
							value={c}
							oninput={(e) =>
								(profile.colors = profile.colors.map((x, j) =>
									j === i ? e.currentTarget.value : x
								))}
							class="size-6 cursor-pointer bg-transparent"
							aria-label={`Brand color ${i + 1}`}
						/>
						<span class="text-xs">{c}</span>
						<button
							type="button"
							class="p-0.5 text-muted-foreground hover:text-foreground"
							aria-label={`Remove color ${c}`}
							onclick={() => (profile.colors = profile.colors.filter((_, j) => j !== i))}
						>
							<XIcon class="size-3" />
						</button>
					</span>
				{/each}
				{#if profile.colors.length < 5}
					<Button
						variant="outline"
						size="sm"
						onclick={() => (profile.colors = [...profile.colors, '#ffffff'])}>Add color</Button
					>
				{/if}
			</div>
		</div>
		<div class="flex flex-col gap-1.5">
			<Label>Caption font</Label>
			<Select.Root
				type="single"
				value={profile.caption_font ?? ''}
				onValueChange={(v) => (profile.caption_font = (v || null) as BrandProfile['caption_font'])}
			>
				<Select.Trigger class="w-48" aria-label="Caption font">
					{profile.caption_font ?? 'Choose a font'}
				</Select.Trigger>
				<Select.Content>
					{#each CAPTION_FONTS as f (f)}
						<Select.Item value={f}>{f}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	{:else if section === 'publishing'}
		<div class="flex flex-col gap-1.5">
			<Label for="cta">Default call to action</Label>
			<Input
				id="cta"
				bind:value={profile.default_cta}
				maxlength={200}
				placeholder="Follow for a new explainer every Tuesday"
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<Label>Default hashtags</Label>
			<ChipsInput bind:value={profile.default_hashtags} max={15} label="Add a hashtag" />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="goal">Posting goal, posts per week</Label>
			<Input
				id="goal"
				type="number"
				min={0}
				max={50}
				class="w-24"
				bind:value={profile.posting_goal}
				placeholder="3"
			/>
		</div>
	{/if}
</div>
