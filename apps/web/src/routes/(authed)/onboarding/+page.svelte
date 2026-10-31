<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { providers, RequiresAI } from '$lib/entities/api-key';
	import type { BrandProfile, DraftRule } from '$lib/entities/brand';
	import { ApiKeyRow } from '$lib/features/api-keys';
	import { pickSection, ProfileSection, sections } from '$lib/features/brand-profile';
	import { DraftRuleList } from '$lib/features/brand-rules';
	import { formAction } from '$lib/shared/lib/form-action';
	import { Button } from '$lib/shared/ui/button';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { youtubeFlash } from '$lib/features/platform-connections';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const TOTAL = 9;
	const YOUTUBE_STEP = 8;
	const SKIPPABLE = [3, 6, 7, YOUTUBE_STEP];
	// Local copies: key saves re-run load, which must not reset what the user is typing.
	let step = $state(untrack(() => data.step));
	let profile = $state<BrandProfile>(untrack(() => structuredClone(data.profile)));
	let drafts = $state<DraftRule[]>(untrack(() => data.drafts));
	let busy = $state(false);
	let generating = $state(false);
	let message = $state('');

	const section = $derived(step >= 2 && step <= 7 ? sections[step - 2] : null);
	const keysReady = $derived(data.ai.llm && data.ai.transcription);
	const canContinue = $derived(
		step === 1 ? keysReady : step === 2 ? profile.name.trim().length > 0 : true
	);
	const title = $derived(
		step === 1
			? 'Connect your AI'
			: step === YOUTUBE_STEP
				? 'Connect YouTube'
				: step === TOTAL
					? "Here's what we understood about your brand"
					: section!.title
	);
	const description = $derived(
		step === 1
			? 'Clips, copy and rules run on your own keys. You need one AI key and one transcription key; a Groq key covers both.'
			: step === YOUTUBE_STEP
				? 'Optional. Connect your channel to post and schedule clips, and to learn from how they perform. You can do this later in Settings.'
				: step === TOTAL
					? 'Edit, delete or add rules. You can change them any time in Brand memory.'
					: section!.description
	);

	async function advance(skip = false) {
		busy = true;
		message = '';
		try {
			const patch = section && !skip ? pickSection(profile, section.id) : {};
			await formAction('profile', { step, patch: JSON.stringify(patch) });
			step += 1;
			if (step === TOTAL && !drafts.length && data.ai.llm) await generate();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not save. Try again.';
		} finally {
			busy = false;
		}
	}

	async function generate() {
		generating = true;
		message = '';
		try {
			drafts = (await formAction<{ drafts: DraftRule[] }>('generate', {})).drafts;
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not write your rules. Try again.';
		} finally {
			generating = false;
		}
	}

	const cleanDrafts = $derived(drafts.filter((d) => d.text.trim()));
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
	<div class="flex flex-col gap-2">
		<span class="text-xs text-muted-foreground">Step {step} of {TOTAL}</span>
		<div class="flex gap-1" aria-hidden="true">
			{#each { length: TOTAL }, i (i)}
				<span class="h-1 flex-1 rounded-full {i < step ? 'bg-foreground' : 'bg-elevated'}"></span>
			{/each}
		</div>
	</div>

	<PageHeader {title} {description} />

	{#if step === 1}
		{#if data.ai.demo}
			<p class="rounded-md border p-3">
				Using shared demo keys. Your account is on the demo list, so you can continue without your
				own keys.
			</p>
		{/if}
		<div class="divide-y rounded-lg border">
			{#each providers as p (p.id)}
				<ApiKeyRow
					provider={p}
					key={data.keys.find((k) => k.provider === p.id)}
					form={form && 'provider' in form && form.provider === p.id ? form : undefined}
				/>
			{/each}
		</div>
	{:else if step === YOUTUBE_STEP}
		{@const result = page.url.searchParams.get('youtube')}
		{#if result && youtubeFlash[result]}
			<p class="text-muted-foreground" role="status">{youtubeFlash[result]}</p>
		{/if}
		<div class="flex items-center justify-between gap-4 rounded-lg border p-4">
			<div>
				<div class="font-medium">YouTube</div>
				<div class="text-muted-foreground">
					{data.youtube
						? `Connected as ${data.youtube.account_name ?? 'your channel'}`
						: 'Not connected'}
				</div>
			</div>
			{#if !data.youtube}
				<!-- Full navigation: the server route redirects to Google, then back here. -->
				<form method="GET" action={resolve('/settings/youtube/connect')} data-sveltekit-reload>
					<input type="hidden" name="next" value="/onboarding" />
					<Button type="submit" variant="outline" size="sm">Connect</Button>
				</form>
			{/if}
		</div>
	{:else if section}
		<ProfileSection section={section.id} bind:profile logoUrl={data.logoUrl} />
	{:else}
		{#if generating}
			<p class="text-muted-foreground">Reading your answers…</p>
		{:else if drafts.length}
			<DraftRuleList bind:rules={drafts} />
		{:else}
			<p class="text-muted-foreground">
				We'll turn your answers into rules for picking clips, writing copy and styling captions.
			</p>
		{/if}
	{/if}

	{#if message || (form && 'message' in form && !('provider' in form) && form.message)}
		<p class="text-danger">{message || (form as { message: string }).message}</p>
	{/if}

	<div class="flex items-center justify-between gap-2 border-t pt-4">
		<div>
			{#if step > 1}
				<Button variant="ghost" disabled={busy || generating} onclick={() => (step -= 1)}>
					Back
				</Button>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if step < TOTAL}
				{#if SKIPPABLE.includes(step)}
					<Button variant="ghost" disabled={busy} onclick={() => advance(true)}>Skip for now</Button
					>
				{/if}
				<Button disabled={busy || !canContinue} onclick={() => advance()}>
					{busy ? 'Saving…' : 'Continue'}
				</Button>
			{:else}
				<RequiresAI need="llm">
					{#snippet children({ disabled })}
						<Button variant="outline" disabled={disabled || generating} onclick={generate}>
							{drafts.length ? 'Write them again' : 'Write my rules'}
						</Button>
					{/snippet}
				</RequiresAI>
				<form method="POST" action="?/finish" use:enhance>
					<input type="hidden" name="rules" value={JSON.stringify(cleanDrafts)} />
					<Button type="submit" disabled={generating}>Looks right</Button>
				</form>
			{/if}
		</div>
	</div>
</main>
