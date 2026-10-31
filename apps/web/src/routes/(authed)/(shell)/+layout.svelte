<script lang="ts">
	import { AppShell } from '$lib/widgets/app-shell';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<AppShell user={data.user} sidebarOpen={data.sidebarOpen}>
	{@render children()}
</AppShell>
