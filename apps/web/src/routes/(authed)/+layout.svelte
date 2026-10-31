<script lang="ts">
	import { invalidate } from '$app/navigation';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	$effect(() => {
		const { data: sub } = data.supabase.auth.onAuthStateChange((_, newSession) => {
			if (newSession?.expires_at !== data.session?.expires_at) invalidate('supabase:auth');
		});
		return () => sub.subscription.unsubscribe();
	});
</script>

{@render children()}
