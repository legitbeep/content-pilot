<script lang="ts">
	import { page } from '$app/state';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { providers } from '$lib/entities/api-key';
	import { AiPreferences, ApiKeyRow } from '$lib/features/api-keys';
	import { PlatformConnections } from '$lib/features/platform-connections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const name = (id: string) => providers.find((p) => p.id === id)?.name ?? id;
	const fmt = (n: number) => n.toLocaleString();
</script>

<PageHeader title="Settings" description="AI providers and connected platforms." />

<section class="flex max-w-2xl flex-col gap-4">
	<div>
		<h2 class="text-base font-medium">AI providers</h2>
		<p class="mt-1 text-muted-foreground">
			Every AI step runs on your own keys. Only have one key? A Groq key covers everything. Keys are
			encrypted before they're stored; we only ever show the last 4 characters.
		</p>
		{#if page.data.ai?.demo}
			<p class="mt-2 rounded-md border p-3">
				Using shared demo keys. Your account is on the demo list, so AI works without your own keys
				(a few videos a day). Add a key below to use your own.
			</p>
		{/if}
	</div>

	<div class="divide-y rounded-lg border">
		{#each providers as p (p.id)}
			<ApiKeyRow
				provider={p}
				key={data.keys.find((k) => k.provider === p.id)}
				form={form && 'provider' in form && form.provider === p.id ? form : undefined}
			/>
		{/each}
	</div>

	<AiPreferences keys={data.keys} settings={data.settings} {form} />

	<div>
		<h3 class="font-medium">Usage, last 7 days</h3>
		{#if data.usage.length}
			<ul class="mt-2 flex flex-col gap-1 text-muted-foreground">
				{#each data.usage as u (u.provider + u.source)}
					<li>
						{name(u.provider)}{u.source === 'demo' ? ' (shared demo key)' : ''}:
						{fmt(u.calls)} calls, {fmt(u.tokens)} tokens
					</li>
				{/each}
			</ul>
		{:else}
			<p class="mt-2 text-muted-foreground">No AI calls yet.</p>
		{/if}
	</div>
</section>

<section class="mt-10 flex max-w-2xl flex-col gap-4">
	<PlatformConnections
		connections={data.connections}
		message={form && 'connectionMessage' in form ? form.connectionMessage : undefined}
	/>
</section>
