<!-- Tick-box review of proposed rule changes: only ticked items are applied. Used by /brand's
"Regenerate rules from profile" diff and by the "Learned from you" candidates (plan 7). -->
<script lang="ts" module>
	export type ReviewItem = {
		id: string;
		text: string;
		/** Small grey text after the rule (scope, source, evidence). */
		meta?: string;
		/** Shown muted (e.g. rules that would be archived). */
		muted?: boolean;
		/** Highlighted (e.g. learned rules with enough evidence). */
		ready?: boolean;
		/** Ticked by default. */
		checked?: boolean;
	};
	/** Ids of ticked and unticked items. */
	export type Picked = { on: string[]; off: string[] };
</script>

<script lang="ts">
	import { Button } from '$lib/shared/ui/button';
	import { cn } from '$lib/shared/lib/utils';

	let {
		title,
		hint = 'Only the changes you tick are applied.',
		sections,
		busy = false,
		applyLabel = 'Apply selected',
		onapply,
		secondary
	}: {
		title: string;
		hint?: string;
		sections: { label: string; items: ReviewItem[] }[];
		busy?: boolean;
		applyLabel?: string;
		onapply: (p: Picked) => void;
		secondary?: { label: string; onclick: (p: Picked) => void };
	} = $props();

	let picks = $state<Record<string, boolean>>({});
	const isOn = (it: ReviewItem) => picks[it.id] ?? !!it.checked;
	const picked = (): Picked => {
		const all = sections.flatMap((s) => s.items);
		return {
			on: all.filter(isOn).map((i) => i.id),
			off: all.filter((i) => !isOn(i)).map((i) => i.id)
		};
	};
</script>

<div class="flex flex-col gap-3 rounded-lg border border-border-strong p-4">
	<p class="font-medium">{title}</p>
	<p class="text-xs text-muted-foreground">{hint}</p>
	{#each sections.filter((s) => s.items.length) as section (section.label)}
		<span class="text-xs text-muted-foreground">{section.label}</span>
		{#each section.items as item (item.id)}
			<label
				class={cn(
					'flex items-start gap-2 rounded-md',
					item.ready && 'border border-border-strong bg-elevated p-2'
				)}
			>
				<input
					type="checkbox"
					checked={isOn(item)}
					onchange={(e) => (picks[item.id] = e.currentTarget.checked)}
					class="mt-1 accent-primary"
				/>
				<span class={cn(item.muted && 'text-muted-foreground')}>
					{item.text}
					{#if item.meta}<span class="text-xs text-muted-foreground">· {item.meta}</span>{/if}
				</span>
			</label>
		{/each}
	{/each}
	<div class="flex justify-end gap-2">
		{#if secondary}
			<Button variant="ghost" disabled={busy} onclick={() => secondary.onclick(picked())}
				>{secondary.label}</Button
			>
		{/if}
		<Button variant="outline" disabled={busy} onclick={() => onapply(picked())}>{applyLabel}</Button
		>
	</div>
</div>
