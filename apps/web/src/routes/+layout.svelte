<script lang="ts">
	import { resolve } from '$app/paths';
	import favicon from '$lib/shared/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const nav = [
		['/', 'Home'],
		['/onboarding', 'Onboarding'],
		['/queue', 'Queue'],
		['/clips', 'Clip Picker'],
		['/editor', 'Editor'],
		['/publish', 'Publish'],
		['/calendar', 'Calendar'],
		['/brand', 'Brand Memory'],
		['/settings', 'Settings']
	] as const;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav>
	{#each nav as [href, label] (href)}
		<a href={resolve(href)}>{label}</a>
	{/each}
</nav>

{@render children()}

<style>
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
</style>
