<script lang="ts">
	import '../app.css';
	import '@fontsource/hanken-grotesk/400.css';
	import '@fontsource/hanken-grotesk/500.css';
	import '@fontsource/hanken-grotesk/600.css';
	import '@fontsource/jetbrains-mono/400.css';
	import favicon from '$lib/shared/assets/favicon.svg';
	import { Toaster } from '$lib/shared/ui/sonner';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Clip Studio</title>
</svelte:head>

{@render children()}
<Toaster />
