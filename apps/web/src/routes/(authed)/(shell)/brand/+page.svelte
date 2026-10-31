<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { RequiresAI } from '$lib/entities/api-key';
	import {
		SCOPES,
		SOURCES,
		scopeLabel,
		sourceLabel,
		ConflictCard,
		READY_AT,
		type BrandProfile,
		type BrandRule,
		type DraftRule,
		type Scope
	} from '$lib/entities/brand';
	import { pickSection, ProfileSection, sections, type Section } from '$lib/features/brand-profile';
	import { RuleReview, RuleRow, ScopeSelect, type Picked } from '$lib/features/brand-rules';
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

	let newText = $state('');
	let newScope = $state<Scope>('all');

	// ---- Regenerate diff: nothing changes until the user applies the parts they accept.
	type Diff = { adds: DraftRule[]; removes: { id: string; text: string; scope: Scope }[] };
	let diff = $state<Diff | null>(null);
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
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not regenerate rules.');
		} finally {
			regenerating = false;
		}
	}
	async function applyDiff({ on }: Picked) {
		if (!diff) return;
		applying = true;
		try {
			await formAction('applyRegenerate', {
				adds: JSON.stringify(diff.adds.filter((_, i) => on.includes(`add-${i}`))),
				remove: diff.removes.filter((r) => on.includes(r.id)).map((r) => r.id)
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

	// ---- Learned from you (plan 7): candidates from edits (plan 7) and performance (plan 9).
	// Nothing becomes active until the user ticks it (or picks "Update rule" on a conflict).
	const byId = $derived(new Map(data.rules.map((r) => [r.id, r])));
	const stated = (r: BrandRule) => {
		const s = r.conflicts_with ? byId.get(r.conflicts_with) : undefined;
		return s && (s.status === 'active' || s.status === 'pinned') ? s : undefined;
	};
	const candidates = $derived(data.rules.filter((r) => r.status === 'candidate'));
	const conflicts = $derived(candidates.filter((r) => stated(r)));
	const reviewable = $derived(candidates.filter((r) => !stated(r)));
	const meta = (r: BrandRule) =>
		`${sourceLabel[r.source] ?? r.source} · seen ${r.evidence_count} ${r.evidence_count === 1 ? 'time' : 'times'}`;
	const learnedSections = $derived([
		{
			label: 'Ready to review',
			items: reviewable
				.filter((r) => r.evidence_count >= READY_AT)
				.map((r) => ({ id: r.id, text: r.rule, meta: meta(r), ready: true, checked: true }))
		},
		{
			label: 'Still learning',
			items: reviewable
				.filter((r) => r.evidence_count < READY_AT)
				.map((r) => ({ id: r.id, text: r.rule, meta: meta(r) }))
		}
	]);
	let reviewing = $state(false);
	async function learned(fields: Record<string, string | string[]>, done: string) {
		reviewing = true;
		try {
			await formAction('learned', fields);
			await invalidateAll();
			toast.success(done);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Could not update the rules.');
		} finally {
			reviewing = false;
		}
	}
	let tab = $state(untrack(() => page.url.searchParams.get('tab') ?? 'rules'));
</script>

<PageHeader
	title="Brand memory"
	description="What you told us, and the rules every AI step follows."
/>

<Tabs.Root bind:value={tab} class="max-w-3xl">
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
			<RuleReview
				title="Suggested changes from your profile"
				sections={[
					{
						label: 'Add',
						items: diff.adds.map((a, i) => ({
							id: `add-${i}`,
							text: a.text,
							meta: scopeLabel[a.scope],
							checked: true
						}))
					},
					{
						label: 'Archive',
						items: diff.removes.map((r) => ({ id: r.id, text: r.text, muted: true }))
					}
				]}
				busy={applying}
				onapply={applyDiff}
				secondary={{ label: 'Discard', onclick: () => (diff = null) }}
			/>
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
		{#each conflicts as c (c.id)}
			<ConflictCard
				stated={stated(c)!.rule}
				learned={c.rule}
				evidence={c.evidence_count}
				onkeep={() => learned({ op: 'keep', id: c.id }, 'Kept your rule.')}
				onupdate={() => learned({ op: 'update', id: c.id }, 'Rule updated.')}
			/>
		{/each}
		{#if reviewable.length}
			<RuleReview
				title="Rules learned from your edits and results"
				hint={`Nothing is used until you tick it. Rules seen ${READY_AT}+ times are ready to review.`}
				sections={learnedSections}
				busy={reviewing}
				applyLabel="Use selected rules"
				onapply={({ on }) => learned({ op: 'apply', activate: on }, 'Rules added.')}
				secondary={{
					label: 'Dismiss unticked',
					onclick: ({ off }) => learned({ op: 'apply', dismiss: off }, 'Dismissed.')
				}}
			/>
		{:else if !conflicts.length}
			<EmptyState
				icon={SparklesIcon}
				text="Rules appear here as you edit clips and posts perform."
			/>
		{/if}
	</Tabs.Content>
</Tabs.Root>
