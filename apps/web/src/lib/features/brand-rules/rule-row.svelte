<!-- One saved rule on /brand: text, source, evidence, status + pin / edit / archive (restore).
Posts to the page's ?/rule action (fields: id, op, text?, scope?). -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import PinIcon from '@lucide/svelte/icons/pin';
	import { sourceLabel, type BrandRule, type Scope } from '$lib/entities/brand';
	import { Badge } from '$lib/shared/ui/badge';
	import { Button } from '$lib/shared/ui/button';
	import { Input } from '$lib/shared/ui/input';
	import ScopeSelect from './scope-select.svelte';

	let { rule }: { rule: BrandRule } = $props();

	let editing = $state(false);
	let text = $state('');
	let scope = $state<Scope>('all');
	const statusLabel: Record<string, string> = {
		pinned: 'Pinned, always used',
		archived: 'Archived',
		candidate: 'Suggested',
		active: 'Active'
	};
	const startEdit = () => {
		text = rule.rule;
		scope = rule.scope;
		editing = true;
	};
	const done =
		() =>
		async ({ update }: { update: () => Promise<void> }) => {
			await update();
			editing = false;
		};
</script>

<li class="flex flex-col gap-2 p-3">
	{#if editing}
		<form method="POST" action="?/rule" use:enhance={done} class="flex items-center gap-2">
			<input type="hidden" name="id" value={rule.id} />
			<input type="hidden" name="op" value="edit" />
			<Input name="text" bind:value={text} maxlength={300} required aria-label="Rule text" />
			<ScopeSelect name="scope" bind:value={scope} />
			<Button type="submit" variant="outline" size="sm">Save</Button>
			<Button variant="ghost" size="sm" onclick={() => (editing = false)}>Cancel</Button>
		</form>
	{:else}
		<div class="flex items-start justify-between gap-4">
			<p class={rule.status === 'archived' ? 'text-muted-foreground line-through' : ''}>
				{#if rule.status === 'pinned'}<PinIcon
						class="mr-1 inline size-3.5"
						aria-label="Pinned"
					/>{/if}
				{rule.rule}
			</p>
			<form method="POST" action="?/rule" use:enhance class="flex shrink-0 gap-1">
				<input type="hidden" name="id" value={rule.id} />
				{#if rule.status === 'archived'}
					<Button type="submit" name="op" value="restore" variant="ghost" size="xs">Restore</Button>
				{:else}
					<Button
						type="submit"
						name="op"
						value={rule.status === 'pinned' ? 'unpin' : 'pin'}
						variant="ghost"
						size="xs">{rule.status === 'pinned' ? 'Unpin' : 'Pin'}</Button
					>
					<Button variant="ghost" size="xs" onclick={startEdit}>Edit</Button>
					<Button type="submit" name="op" value="archive" variant="ghost" size="xs">Archive</Button>
				{/if}
			</form>
		</div>
		<div class="flex items-center gap-2 text-xs text-muted-foreground">
			<Badge variant="outline">{sourceLabel[rule.source] ?? rule.source}</Badge>
			{#if rule.evidence_count}<span>{rule.evidence_count} times</span>{/if}
			<span>{statusLabel[rule.status] ?? rule.status}</span>
		</div>
	{/if}
</li>
