<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Button } from '$lib/shared/ui/button';
	import { CodeInput } from '$lib/shared/ui/code-input';
	import * as Dialog from '$lib/shared/ui/dialog';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const message = $derived(
		form?.message ??
			(page.url.searchParams.has('error') ? 'Sign-in did not complete. Try again.' : null)
	);

	let codeOpen = $state(false);
	let code = $state('');
	let codeError = $state<string | null>(null);
	let verifying = $state(false);
	let codeForm = $state<HTMLFormElement | null>(null);
	let codeInput = $state<HTMLInputElement | null>(null);
</script>

<main class="relative grid min-h-svh place-items-center overflow-hidden bg-abstract px-6">
	<div class="flex w-full max-w-xs animate-in-fade flex-col items-center gap-6 text-center">
		<div>
			<h1 class="text-xl font-semibold tracking-tight">Clip Studio</h1>
			<p class="mt-1 text-muted-foreground">
				Turn long videos into short clips that sound like you.
			</p>
		</div>
		<form method="POST" action="?/google" class="flex w-full flex-col gap-2">
			<Button type="submit" class="w-full">Continue with Google</Button>
			{#if data.accessCodes}
				<Button type="button" variant="outline" class="w-full" onclick={() => (codeOpen = true)}>
					Enter with code
				</Button>
			{/if}
			{#if data.devLogin}
				<Button type="submit" formaction="/auth/dev-login" variant="ghost" class="w-full">
					Dev login (test user)
				</Button>
			{/if}
		</form>
		{#if message}<p class="text-xs text-danger" role="alert">{message}</p>{/if}
	</div>
</main>

<Dialog.Root
	bind:open={codeOpen}
	onOpenChange={(open) => {
		if (!open) [code, codeError] = ['', null];
	}}
>
	<Dialog.Content
		onOpenAutoFocus={(e) => {
			e.preventDefault();
			codeInput?.focus();
		}}
	>
		<Dialog.Header>
			<Dialog.Title>Enter with code</Dialog.Title>
			<Dialog.Description>
				Type the 6-digit access code you were given. Each code opens its own workspace.
			</Dialog.Description>
		</Dialog.Header>
		<form
			bind:this={codeForm}
			method="POST"
			action="?/code"
			class="grid gap-3 py-2"
			use:enhance={() => {
				verifying = true;
				codeError = null;
				return async ({ result, update }) => {
					if (result.type === 'failure') {
						verifying = false;
						codeError = String(result.data?.codeMessage ?? 'That code didn’t work.');
						code = '';
						await tick();
						codeInput?.focus();
						return;
					}
					// Success redirects into the app; keep the spinner state until the page changes.
					await update();
				};
			}}
		>
			<CodeInput
				bind:value={code}
				bind:inputRef={codeInput}
				name="code"
				label="6-digit access code"
				invalid={!!codeError}
				disabled={verifying}
				oncomplete={() => codeForm?.requestSubmit()}
			/>
			<p
				class="min-h-4 text-center text-xs {codeError ? 'text-danger' : 'text-muted-foreground'}"
				aria-live="polite"
			>
				{verifying ? 'Checking code…' : (codeError ?? 'Paste works too.')}
			</p>
		</form>
		<Dialog.Footer>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Cancel</Button>
				{/snippet}
			</Dialog.Close>
			<Button onclick={() => codeForm?.requestSubmit()} disabled={code.length < 6 || verifying}>
				{verifying ? 'Signing in…' : 'Continue'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
