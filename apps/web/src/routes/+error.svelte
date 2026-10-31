<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { EmptyState } from '$lib/shared/ui/empty-state';

	// Thrown error(status, message) texts are written for users; unexpected errors arrive as
	// SvelteKit's "Internal Error" and get a generic line instead.
	const msg = $derived(page.error?.message);
	const text = $derived(
		page.status === 404
			? "This page doesn't exist, or it isn't yours."
			: msg && msg !== 'Internal Error'
				? msg
				: 'Something went wrong on our side. Try again in a moment.'
	);
</script>

<svelte:head><title>Error {page.status} · Clip Studio</title></svelte:head>

<main class="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-24">
	<h1 class="text-xl font-semibold tracking-tight">Error {page.status}</h1>
	<EmptyState icon={TriangleAlertIcon} {text} action={{ label: 'Go home', href: resolve('/') }} />
</main>
