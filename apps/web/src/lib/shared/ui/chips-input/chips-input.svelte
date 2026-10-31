<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { Input } from '$lib/shared/ui/input';

	let {
		value = $bindable([]),
		max = 20,
		placeholder = 'Type and press Enter',
		label,
		disabled = false
	}: {
		value?: string[];
		max?: number;
		placeholder?: string;
		/** aria-label for the text input. */
		label: string;
		disabled?: boolean;
	} = $props();

	let draft = $state('');
	const full = $derived(value.length >= max);

	function add() {
		const v = draft.trim().replace(/,$/, '').trim();
		if (v && !full && !value.some((x) => x.toLowerCase() === v.toLowerCase()))
			value = [...value, v];
		draft = '';
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			add();
		} else if (e.key === 'Backspace' && !draft && value.length) {
			value = value.slice(0, -1);
		}
	}
</script>

<div class="flex flex-col gap-2">
	{#if value.length}
		<ul class="flex flex-wrap gap-1.5">
			{#each value as chip, i (chip)}
				<li
					class="inline-flex h-6 items-center gap-1 rounded-sm border bg-elevated pr-1 pl-2 text-xs"
				>
					{chip}
					<button
						type="button"
						class="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
						aria-label={`Remove ${chip}`}
						{disabled}
						onclick={() => (value = value.filter((_, j) => j !== i))}
					>
						<XIcon class="size-3" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<Input
		bind:value={draft}
		{onkeydown}
		onblur={add}
		placeholder={full ? `Up to ${max}` : placeholder}
		aria-label={label}
		disabled={disabled || full}
	/>
</div>
