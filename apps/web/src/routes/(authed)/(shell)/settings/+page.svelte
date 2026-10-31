<script lang="ts">
	import { PageHeader } from '$lib/shared/ui/page-header';
	import { providers } from '$lib/entities/api-key';
	import { ApiKeyRow } from '$lib/features/api-keys';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<PageHeader title="Settings" description="API keys and connected platforms." />

<section class="max-w-2xl">
	<h2 class="text-base font-medium">API keys</h2>
	<p class="mt-1 text-muted-foreground">
		Keys are encrypted before they're stored. We only ever show the last 4 characters.
	</p>
	<div class="mt-4 divide-y rounded-lg border">
		{#each providers as p (p.id)}
			<ApiKeyRow
				provider={p}
				key={data.keys.find((k) => k.provider === p.id)}
				form={form?.provider === p.id ? form : undefined}
			/>
		{/each}
	</div>
</section>
