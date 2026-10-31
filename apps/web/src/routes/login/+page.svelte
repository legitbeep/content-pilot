<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/shared/ui/button';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const message = $derived(
		form?.message ??
			(page.url.searchParams.has('error') ? 'Sign-in did not complete. Try again.' : null)
	);
</script>

<main class="grid min-h-svh place-items-center px-6">
	<form method="POST" class="flex w-full max-w-xs flex-col items-center gap-6 text-center">
		<div>
			<h1 class="text-xl font-semibold tracking-tight">Clip Studio</h1>
			<p class="mt-1 text-muted-foreground">
				Turn long videos into short clips that sound like you.
			</p>
		</div>
		<Button type="submit" class="w-full">Continue with Google</Button>
		{#if message}<p class="text-xs text-danger" role="alert">{message}</p>{/if}
		{#if data.devLogin}
			<Button type="submit" formaction="/auth/dev-login" variant="outline" class="w-full">
				Dev login (test user)
			</Button>
		{/if}
	</form>
</main>
