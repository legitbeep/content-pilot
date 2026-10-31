<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button, buttonVariants } from '$lib/shared/ui/button';
	import * as Avatar from '$lib/shared/ui/avatar';
	import { platforms } from '$lib/entities/post';

	type Connection = { platform: string; account_name: string | null; avatar_url: string | null };
	let { connections, message }: { connections: Connection[]; message?: string } = $props();

	const yt = $derived(connections.find((c) => c.platform === 'youtube'));
	const flash: Record<string, string> = {
		connected: 'YouTube connected.',
		denied: 'YouTube connect was cancelled.',
		missing_scopes: 'Allow every requested permission to connect YouTube, then try again.',
		no_channel: 'This Google account has no YouTube channel.',
		error: 'Could not connect YouTube. Try again.'
	};
	const result = $derived(page.url.searchParams.get('youtube'));
	let busy = $state(false);
</script>

<div>
	<h2 class="text-base font-medium">Connected platforms</h2>
	<p class="mt-1 text-muted-foreground">
		Connect YouTube to post and schedule clips. Its refresh token is encrypted before it's stored.
	</p>
	{#if message || (result && flash[result])}
		<p class="mt-2 text-muted-foreground" role="status">{message ?? flash[result!]}</p>
	{/if}
</div>

<div class="divide-y rounded-lg border">
	{#each platforms as p (p.id)}
		<div class="flex items-center justify-between gap-4 p-4">
			<div class="flex items-center gap-3">
				{#if p.id === 'youtube' && yt}
					<Avatar.Root class="size-8">
						<Avatar.Image src={yt.avatar_url} alt="" />
						<Avatar.Fallback>{yt.account_name?.[0] ?? 'Y'}</Avatar.Fallback>
					</Avatar.Root>
				{/if}
				<div>
					<div class="font-medium">{p.name}</div>
					<div class="text-muted-foreground">
						{#if p.id !== 'youtube'}Coming soon. Copy captions from Publish for now.
						{:else if yt}Connected as {yt.account_name ?? 'your channel'}
						{:else}Not connected{/if}
					</div>
				</div>
			</div>
			{#if p.id === 'youtube'}
				{#if yt}
					<form
						method="POST"
						action="?/disconnect"
						use:enhance={() => {
							busy = true;
							return async ({ update }) => {
								await update();
								busy = false;
							};
						}}
					>
						<Button type="submit" variant="outline" size="sm" disabled={busy}>Disconnect</Button>
					</form>
				{:else}
					<!-- Full navigation: the server route redirects to Google. -->
					<a
						href={resolve('/settings/youtube/connect')}
						data-sveltekit-reload
						class={buttonVariants({ variant: 'outline', size: 'sm' })}>Connect</a
					>
				{/if}
			{/if}
		</div>
	{/each}
</div>
