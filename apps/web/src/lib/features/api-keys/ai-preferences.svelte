<script lang="ts">
	import { enhance } from '$app/forms';
	import { LLM_PROVIDERS, TASKS, TRANSCRIPTION_PROVIDERS } from '@clip-studio/llm-registry';
	import { Button } from '$lib/shared/ui/button';
	import { providers, type ApiKey } from '$lib/entities/api-key';
	import ProviderSelect from './provider-select.svelte';

	let {
		keys,
		settings,
		form
	}: {
		keys: ApiKey[];
		settings: {
			llm_provider: string | null;
			transcription_provider: string | null;
			task_overrides: Record<string, string>;
		};
		form?: { prefsSaved?: boolean; prefsMessage?: string } | null;
	} = $props();

	let busy = $state(false);
	const usable = $derived(keys.filter((k) => !k.invalid_at).map((k) => k.provider as string));
	const options = (ids: string[]) =>
		providers.filter((p) => ids.includes(p.id) && usable.includes(p.id));
	const llmOptions = $derived(options(LLM_PROVIDERS));
	const transcriptionOptions = $derived(options(TRANSCRIPTION_PROVIDERS));
	const taskLabel = (t: string) => t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
</script>

<form
	method="POST"
	action="?/prefs"
	class="flex flex-col gap-4 rounded-lg border p-4"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<div class="flex items-center justify-between gap-4">
		<div>
			<div class="font-medium">Default AI provider</div>
			<div class="text-muted-foreground">Used for every AI step unless a task overrides it.</div>
		</div>
		<ProviderSelect
			name="llm_provider"
			label="Default AI provider"
			value={settings.llm_provider}
			options={llmOptions}
		/>
	</div>
	<div class="flex items-center justify-between gap-4">
		<div>
			<div class="font-medium">Transcription provider</div>
			<div class="text-muted-foreground">Deepgram adds speaker labels; Groq doesn't.</div>
		</div>
		<ProviderSelect
			name="transcription_provider"
			label="Transcription provider"
			value={settings.transcription_provider}
			options={transcriptionOptions}
		/>
	</div>

	<details class="group">
		<summary class="cursor-pointer text-muted-foreground">Advanced: provider per task</summary>
		<div class="mt-3 flex flex-col gap-2">
			{#each TASKS as t (t)}
				<div class="flex items-center justify-between gap-4">
					<span>{taskLabel(t)}</span>
					<ProviderSelect
						name={`task:${t}`}
						label={`Provider for ${taskLabel(t)}`}
						value={settings.task_overrides[t] ?? null}
						options={llmOptions}
						auto="Default"
					/>
				</div>
			{/each}
		</div>
	</details>

	<div class="flex items-center justify-end gap-3">
		{#if form?.prefsMessage}
			<p class="text-xs text-danger">{form.prefsMessage}</p>
		{:else if form?.prefsSaved}
			<p class="text-xs text-muted-foreground">Saved.</p>
		{/if}
		<Button type="submit" variant="outline" disabled={busy}>Save</Button>
	</div>
</form>
