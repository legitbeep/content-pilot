<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/shared/ui/button';
	import { Input } from '$lib/shared/ui/input';
	import { keyStatus, type ApiKey, type providers } from '$lib/entities/api-key';
	import { cn } from '$lib/shared/lib/utils';

	let {
		provider,
		key,
		form
	}: {
		provider: (typeof providers)[number];
		key?: ApiKey;
		form?: { message?: string; result?: string };
	} = $props();

	let replacing = $state(false);
	let busy = $state(false);
	const status = $derived(key && keyStatus(key));
	const statusStyle = {
		valid: 'text-success',
		unverified: 'text-muted-foreground',
		invalid: 'text-danger'
	};
	const statusLabel = {
		valid: 'Valid',
		unverified: 'Unverified',
		invalid: 'Rejected by provider'
	};
	const date = (s: string) => new Date(s).toLocaleDateString(undefined, { dateStyle: 'medium' });

	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
			replacing = false;
		};
	};
</script>

<div class="flex flex-col gap-3 p-4">
	<div class="flex items-start justify-between gap-4">
		<div>
			<div class="font-medium">{provider.name}</div>
			<div class="text-muted-foreground">{provider.description}</div>
		</div>
		{#if key && status}
			<div class="flex shrink-0 items-center gap-3">
				<span class="font-mono text-muted-foreground">••••{key.last4}</span>
				<span class={cn('text-xs', statusStyle[status])}>{statusLabel[status]}</span>
			</div>
		{/if}
	</div>

	{#if key && !replacing}
		<div class="flex items-center justify-between gap-4">
			<span class="text-xs text-muted-foreground">
				{key.validated_at ? `Validated ${date(key.validated_at)}` : `Saved ${date(key.created_at)}`}
			</span>
			<div class="flex gap-2">
				<Button size="sm" variant="outline" onclick={() => (replacing = true)}>Replace</Button>
				<form method="POST" action="?/remove" use:enhance={submit}>
					<input type="hidden" name="provider" value={provider.id} />
					<Button size="sm" variant="ghost" type="submit" disabled={busy}>Remove</Button>
				</form>
			</div>
		</div>
	{:else}
		<form method="POST" action="?/save" use:enhance={submit} class="flex gap-2">
			<input type="hidden" name="provider" value={provider.id} />
			<Input
				name="key"
				type="password"
				autocomplete="off"
				placeholder={`${provider.name} API key`}
				required
				aria-label={`${provider.name} API key`}
			/>
			<Button type="submit" variant="outline" disabled={busy}>
				{busy ? 'Checking…' : 'Save'}
			</Button>
			{#if replacing}
				<Button variant="ghost" onclick={() => (replacing = false)}>Cancel</Button>
			{/if}
		</form>
	{/if}

	{#if form?.message}
		<p class="text-xs text-danger">{form.message}</p>
	{:else if form?.result === 'unverified'}
		<p class="text-xs text-muted-foreground">
			Saved, but we couldn't reach {provider.name} to check it. We'll check on first use.
		</p>
	{/if}
</div>
