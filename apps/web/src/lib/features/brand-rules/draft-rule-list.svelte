<!-- Editable list of draft rules (onboarding review): edit text, change scope, delete, add. -->
<script lang="ts">
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import type { DraftRule } from '$lib/entities/brand';
	import { Button } from '$lib/shared/ui/button';
	import { Input } from '$lib/shared/ui/input';
	import ScopeSelect from './scope-select.svelte';

	let { rules = $bindable() }: { rules: DraftRule[] } = $props();
</script>

<ul class="flex flex-col divide-y rounded-lg border">
	{#each rules as rule, i (i)}
		<li class="flex items-center gap-2 p-2">
			<Input bind:value={rule.text} maxlength={300} aria-label={`Rule ${i + 1}`} />
			<ScopeSelect bind:value={rule.scope} />
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Delete rule"
				onclick={() => (rules = rules.filter((_, j) => j !== i))}
			>
				<TrashIcon />
			</Button>
		</li>
	{/each}
	<li class="p-2">
		<Button
			variant="ghost"
			size="sm"
			onclick={() => (rules = [...rules, { text: '', scope: 'all' }])}
		>
			Add a rule
		</Button>
	</li>
</ul>
