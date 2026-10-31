<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { RequiresAI } from '$lib/entities/api-key';
	import {
		SCOPES,
		SOURCES,
		scopeLabel,
		sourceLabel,
		type BrandProfile,
		type DraftRule,
		type Scope
	} from '$lib/entities/brand';
	import { pickSection, ProfileSection, sections, type Section } from '$lib/features/brand-profile';
	import { RuleRow, ScopeSelect } from '$lib/features/brand-rules';
	import { formAction } from '$lib/shared/lib/form-action';
	import { Button } from '$lib/shared/ui/button';
	import { EmptyState } from '$lib/shared/ui/empty-state';
	import { Input } from '$lib/shared/ui/input';
	import { Label } from '$lib/shared/ui/label';
	import { PageHeader } from '$lib/shared/ui/page-header';
	import * as Select from '$lib/shared/ui/select';
	import { Switch } from '$lib/shared/ui/switch';
	import * as Tabs from '$lib/shared/ui/tabs';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// ---- You told us
	let profile = $state<BrandProfile>(untrack(() => structuredClone(data.profile)));
	let saving = $state<Section | null>(null);
	async function saveSection(id: Section) {
		saving = id;
		try {
			await formAction('profile', { patch: JSON.stringify(pickSection(profile, id)) });
			toast.success('Saved. Your rules didn’t change; regenerate them to pick up this edit.');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not save.');
		} finally {
			saving = null;
		}
	}

	// ---- Rules
	let scopeFilter = $state<Scope | 'any'>('any');
	let sourceFilter = $state<string>('any');
	let showArchived = $state(false);
	const visible = $derived(
		data.rules.filter(
			(r) =>
				r.status !== 'candidate' &&
				(showArchived || r.status !== 'archived') &&
				(scopeFilter === 'any' || r.scope === scopeFilter) &&
				(sourceFilter === 'any' || r.source === sourceFilter)
		)
	);
	const groups = $derived(
		SCOPES.map((s) => ({ scope: s, rules: visible.filter((r) => r.scope === s) })).filter(
			(g) => g.rules.length
		)
	);
	const learned = $derived(data.rules.filter((r) => r.status === 'candidate'));

	let newText = $state('');
	let newScope = $state<Scope>('all');

	// ---- Regenerate diff: nothing changes until the user applies the parts they accept.
	type Diff = { adds: DraftRule[]; removes: { id: string; text: string; scope: Scope }[] };
	let diff = $state<Diff | null>(null);
	let acceptAdd = $state<boolean[]>([]);
	let acceptRemove = $state<boolean[]>([]);
	let regenerating = $state(false);
	let applying = $state(false);

	async function regenerate() {
		regenerating = true;
		try {
			const d = (await formAction<{ diff: Diff }>('regenerate', {})).diff;
			if (!d.adds.length && !d.removes.length) {
				toast.success('Your rules already match your profile.');
				return;
			}
			diff = d;
			acceptAdd = d.adds.map(() => true);
			acceptRemove = d.removes.map(() => false);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not regenerate rules.');
		} finally {
			regenerating = false;
		}
	}
	async function applyDiff() {
		if (!diff) return;
		applying = true;
		try {
			await formAction('applyRegenerate', {
				adds: JSON.stringify(diff.adds.filter((_, i) => acceptAdd[i])),
				remove: diff.removes.filter((_, i) => acceptRemove[i]).map((r) => r.id)
			});
			diff = null;
			await invalidateAll();
			toast.success('Rules updated.');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not apply the changes.');
		} finally {
			applying = false;
		}
	}
</script>

<PageHeader
	title="Brand memory"
	description="What you told us, and the rules every AI step follows."
/>

<Tabs.Root value="rules" class="max-w-3xl">
	<Tabs.List>
		<Tabs.Trigger value="rules">Rules</Tabs.Trigger>
		<Tabs.Trigger value="profile">You told us</Tabs.Trigger>
		<Tabs.Trigger value="learned">Learned from you</Tabs.Trigger>
	</Tabs.List>

	<Tabs.Content value="rules" class="flex flex-col gap-4 pt-4">
		<div class="flex flex-wrap items-center gap-2">
			<Select.Root type="single" bind:value={scopeFilter as string}>
				<Select.Trigger class="w-40" aria-label="Filter by scope">
					{scopeFilter === 'any' ? 'All scopes' : scopeLabel[scopeFilter]}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="any">All scopes</Select.Item>
					{#each SCOPES as s (s)}<Select.Item value={s}>{scopeLabel[s]}</Select.Item>{/each}
				</Select.Content>
			</Select.Root>
			<Select.Root type="single" bind:value={sourceFilter}>
				<Select.Trigger class="w-44" aria-label="Filter by source">
					{sourceFilter === 'any'
						? 'All sources'
						: (sourceLabel[sourceFilter as keyof typeof sourceLabel] ?? sourceFilter)}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="any">All sources</Select.Item>
					{#each SOURCES as s (s)}<Select.Item value={s}>{sourceLabel[s]}</Select.Item>{/each}
				</Select.Content>
			</Select.Root>
			<Label class="ml-2 flex items-center gap-2 font-normal">
				<Switch bind:checked={showArchived} /> Show archived
			</Label>
			<div class="ml-auto">
				<RequiresAI need="llm">
					{#snippet children({ disabled })}
						<Button variant="outline" disabled={disabled || regenerating} onclick={regenerate}>
							{regenerating ? 'Reading your profile…' : 'Regenerate rules from profile'}
						</Button>
					{/snippet}
				</RequiresAI>
			</div>
		</div>

		{#if diff}
			<div class="flex flex-col gap-3 rounded-lg border border-border-strong p-4">
				<p class="font-medium">Suggested changes from your profile</p>
				<p class="text-xs text-muted-foreground">Only the changes you tick are applied.</p>
				{#if diff.adds.length}
					<span class="text-xs text-muted-foreground">Add</span>
					{#each diff.adds as add, i (i)}
						<label class="flex items-start gap-2">
							<input type="checkbox" bind:checked={acceptAdd[i]} class="mt-1 accent-primary" />
							<span
								>{add.text}
								<span class="text-xs text-muted-foreground">· {scopeLabel[add.scope]}</span></span
							>
						</label>
					{/each}
				{/if}
				{#if diff.removes.length}
					<span class="text-xs text-muted-foreground">Archive</span>
					{#each diff.removes as rem, i (rem.id)}
						<label class="flex items-start gap-2">
							<input type="checkbox" bind:checked={acceptRemove[i]} class="mt-1 accent-primary" />
							<span class="text-muted-foreground">{rem.text}</span>
						</label>
					{/each}
				{/if}
				<div class="flex justify-end gap-2">
					<Button variant="ghost" onclick={() => (diff = null)}>Discard</Button>
					<Button variant="outline" disabled={applying} onclick={applyDiff}>Apply selected</Button>
				</div>
			</div>
		{/if}

		<form
			method="POST"
			action="?/rule"
			use:enhance={() =>
				async ({ update, result }) => {
					await update();
					if (result.type === 'success') newText = '';
				}}
			class="flex items-center gap-2"
		>
			<input type="hidden" name="op" value="add" />
			<Input
				name="text"
				bind:value={newText}
				maxlength={300}
				placeholder="Add a rule, e.g. Never open with a question"
				aria-label="New rule"
			/>
			<ScopeSelect name="scope" bind:value={newScope} />
			<Button type="submit" variant="outline" disabled={newText.trim().length < 3}>Add rule</Button>
		</form>
		{#if form && 'message' in form && form.message}
			<p class="text-xs text-danger">{form.message}</p>
		{/if}

		{#if groups.length}
			{#each groups as g (g.scope)}
				<section class="flex flex-col gap-2">
					<h2 class="text-base font-medium">{scopeLabel[g.scope]}</h2>
					<ul class="divide-y rounded-lg border">
						{#each g.rules as rule (rule.id)}<RuleRow {rule} />{/each}
					</ul>
				</section>
			{/each}
		{:else}
			<EmptyState
				icon={SparklesIcon}
				text={data.rules.length
					? 'No rules match these filters.'
					: 'No rules yet. Add one above, or regenerate them from your profile.'}
			/>
		{/if}
	</Tabs.Content>

	<Tabs.Content value="profile" class="flex flex-col gap-4 pt-4">
		{#each sections as s (s.id)}
			<section class="flex flex-col gap-4 rounded-lg border p-4">
				<div>
					<h2 class="text-base font-medium">{s.title}</h2>
					<p class="text-muted-foreground">{s.description}</p>
				</div>
				<ProfileSection section={s.id} bind:profile logoUrl={data.logoUrl} />
				<div class="flex justify-end">
					<Button variant="outline" disabled={saving === s.id} onclick={() => saveSection(s.id)}>
						{saving === s.id ? 'Saving…' : 'Save'}
					</Button>
				</div>
			</section>
		{/each}
	</Tabs.Content>

	<Tabs.Content value="learned" class="flex flex-col gap-4 pt-4">
		{#if learned.length}
			<ul class="divide-y rounded-lg border">
				{#each learned as rule (rule.id)}<RuleRow {rule} />{/each}
			</ul>
		{:else}
			<EmptyState
				icon={SparklesIcon}
				text="Rules appear here as you edit clips and posts perform."
			/>
		{/if}
	</Tabs.Content>
</Tabs.Root>
