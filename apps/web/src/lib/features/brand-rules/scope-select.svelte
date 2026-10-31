<script lang="ts">
	import { SCOPES, scopeLabel, type Scope } from '$lib/entities/brand';
	import * as Select from '$lib/shared/ui/select';

	let {
		value = $bindable(),
		name,
		class: className = 'w-40'
	}: { value: Scope; name?: string; class?: string } = $props();
</script>

<Select.Root type="single" {name} bind:value={value as string}>
	<Select.Trigger class={className} aria-label="Scope">{scopeLabel[value]}</Select.Trigger>
	<Select.Content>
		{#each SCOPES as s (s)}
			<Select.Item value={s}>{scopeLabel[s]}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
