<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { User } from '@supabase/supabase-js';
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { resolve } from '$app/paths';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import UserIcon from '@lucide/svelte/icons/user';
	import * as Sidebar from '$lib/shared/ui/sidebar';
	import * as DropdownMenu from '$lib/shared/ui/dropdown-menu';
	import * as Avatar from '$lib/shared/ui/avatar';
	import { navFor, nav } from '$lib/shared/config';
	import { setTopbarSlot, type TopbarSlot } from '$lib/shared/ui/topbar-actions';
	import Topbar from './topbar.svelte';
	import CommandPalette from './command-palette.svelte';
	import ShortcutSheet from './shortcut-sheet.svelte';
	import { createKeyHandler } from './keyboard';

	let {
		user,
		sidebarOpen = true,
		children
	}: {
		user: Pick<User, 'email' | 'user_metadata'> | null;
		sidebarOpen?: boolean;
		children: Snippet;
	} = $props();

	let paletteOpen = $state(false);
	let helpOpen = $state(false);
	const slot: TopbarSlot = $state({});
	setTopbarSlot(slot);
	const active = $derived(navFor(page.url.pathname));
	// Clips/Editor/Publish highlight Queue, their parent.
	const activeHref = $derived(active?.parent ?? active?.href);

	const name = $derived(user?.user_metadata?.full_name ?? user?.email ?? 'Account');
	const avatarUrl = $derived(user?.user_metadata?.avatar_url as string | undefined);
	const initials = $derived(
		name
			.split(/[\s@]/)
			.slice(0, 2)
			.map((p: string) => p[0]?.toUpperCase())
			.join('')
	);

	const onkeydown = createKeyHandler({
		palette: () => (paletteOpen = !paletteOpen),
		help: () => (helpOpen = !helpOpen),
		go: (href) => goto(resolve(href))
	});
</script>

<svelte:window {onkeydown} />

<!-- Server loads (e.g. presigning clip URLs) can take a second; show the click registered. -->
{#if navigating.to}
	<div
		class="fixed inset-x-0 top-0 z-50 h-0.5 bg-info motion-safe:animate-pulse"
		role="progressbar"
		aria-label="Loading page"
	></div>
{/if}

<Sidebar.Provider open={sidebarOpen}>
	<Sidebar.Root collapsible="icon">
		<Sidebar.Header>
			<div
				class="flex h-8 items-center gap-2 px-2 font-semibold group-data-[collapsible=icon]:px-0"
			>
				<span class="grid size-5 shrink-0 place-items-center rounded-sm bg-elevated text-xs">C</span
				>
				<span class="truncate group-data-[collapsible=icon]:hidden">Clip Studio</span>
			</div>
		</Sidebar.Header>
		<Sidebar.Content>
			<Sidebar.Group>
				<Sidebar.Menu>
					{#each nav.filter((r) => r.sidebar) as route (route.href)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								isActive={activeHref === route.href}
								tooltipContent={route.label}
								class="relative data-[active=true]:before:absolute data-[active=true]:before:inset-y-1.5 data-[active=true]:before:left-0 data-[active=true]:before:w-0.5 data-[active=true]:before:rounded-full data-[active=true]:before:bg-accent"
							>
								{#snippet child({ props })}
									<a href={resolve(route.href)} {...props}>
										<route.icon />
										<span>{route.label}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.Group>
		</Sidebar.Content>
		<Sidebar.Footer>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Sidebar.MenuButton {...props} size="lg">
									<Avatar.Root class="size-6 rounded-sm">
										<Avatar.Image src={avatarUrl} alt="" />
										<Avatar.Fallback class="rounded-sm text-xs">{initials}</Avatar.Fallback>
									</Avatar.Root>
									<span class="truncate">{name}</span>
								</Sidebar.MenuButton>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content side="top" align="start" class="w-56">
							<DropdownMenu.Label class="truncate text-muted-foreground">
								{user?.email}
							</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onSelect={() => goto(resolve('/settings'))}>
								<UserIcon />Account
							</DropdownMenu.Item>
							<DropdownMenu.Item
								onSelect={() =>
									(document.getElementById('signout') as HTMLFormElement).requestSubmit()}
							>
								<LogOutIcon />Sign out
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Footer>
	</Sidebar.Root>
	<Sidebar.Inset class="min-w-0 bg-background">
		<Topbar topbar={slot} onpalette={() => (paletteOpen = true)} />
		<main
			class="mx-auto w-full max-w-5xl flex-1 px-6 py-8 has-[[data-full-width]]:max-w-none has-[[data-full-width]]:py-4"
		>
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>

<form id="signout" method="POST" action={resolve('/auth/signout')} hidden></form>
<CommandPalette bind:open={paletteOpen} />
<ShortcutSheet bind:open={helpOpen} />
