<script lang="ts">
	import { PinInput, REGEXP_ONLY_DIGITS } from 'bits-ui';
	import { cn } from '$lib/shared/lib/utils.js';

	/** One-time code cells (digits only). Paste and SMS/password-manager autofill fill every cell;
	 * `name` posts the value with a plain form. */
	let {
		value = $bindable(''),
		length = 6,
		name,
		label,
		invalid = false,
		disabled = false,
		inputRef = $bindable(null),
		oncomplete
	}: {
		value?: string;
		length?: number;
		name?: string;
		label: string;
		invalid?: boolean;
		disabled?: boolean;
		inputRef?: HTMLInputElement | null;
		oncomplete?: (value: string) => void;
	} = $props();
</script>

<PinInput.Root
	bind:value
	bind:inputRef
	maxlength={length}
	pattern={REGEXP_ONLY_DIGITS}
	{name}
	{disabled}
	aria-label={label}
	aria-invalid={invalid || undefined}
	onComplete={(v: string) => oncomplete?.(v)}
	class="flex items-center justify-center gap-2 has-disabled:opacity-50"
>
	{#snippet children({ cells })}
		{#each cells as cell, i (i)}
			<PinInput.Cell
				{cell}
				class={cn(
					'relative grid size-11 place-items-center rounded-md border bg-subtle text-lg font-medium tabular-nums transition-colors',
					cell.isActive && 'border-ring ring-3 ring-ring/50',
					invalid && 'border-destructive',
					invalid && cell.isActive && 'ring-destructive/20'
				)}
			>
				{cell.char}
				{#if cell.hasFakeCaret}
					<span class="pointer-events-none absolute inset-0 grid place-items-center">
						<span class="h-5 w-px animate-caret-blink bg-foreground"></span>
					</span>
				{/if}
			</PinInput.Cell>
		{/each}
	{/snippet}
</PinInput.Root>
