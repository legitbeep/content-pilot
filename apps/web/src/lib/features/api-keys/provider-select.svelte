<script lang="ts">
	import * as Select from '$lib/shared/ui/select';

	let {
		name,
		label,
		value,
		options,
		auto = 'Automatic'
	}: {
		name: string;
		label: string;
		value: string | null;
		options: { id: string; name: string }[];
		auto?: string;
	} = $props();

	// Writable derived: follows saved data, the select overrides it locally.
	let current = $derived(value && options.some((o) => o.id === value) ? value : 'auto');
	const shown = $derived(options.find((o) => o.id === current)?.name ?? auto);
</script>

<Select.Root type="single" {name} bind:value={current}>
	<Select.Trigger class="w-48" aria-label={label}>{shown}</Select.Trigger>
	<Select.Content>
		<Select.Item value="auto">{auto}</Select.Item>
		{#each options as o (o.id)}
			<Select.Item value={o.id}>{o.name}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
