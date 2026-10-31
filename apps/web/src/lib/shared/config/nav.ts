// Docs: docs/design/design-system.md
// One route list for sidebar, command palette, breadcrumbs and shortcuts.
import type { Component } from 'svelte';
import HouseIcon from '@lucide/svelte/icons/house';
import ListVideoIcon from '@lucide/svelte/icons/list-video';
import CalendarIcon from '@lucide/svelte/icons/calendar';
import BrainIcon from '@lucide/svelte/icons/brain';
import SettingsIcon from '@lucide/svelte/icons/settings';
import ScissorsIcon from '@lucide/svelte/icons/scissors';
import FilmIcon from '@lucide/svelte/icons/film';
import SendIcon from '@lucide/svelte/icons/send';

export type NavRoute = {
	href: '/' | '/queue' | '/calendar' | '/brand' | '/settings' | '/clips' | '/editor' | '/publish';
	label: string;
	icon: Component;
	/** Shown in the sidebar; the rest are reached from Queue. */
	sidebar: boolean;
	parent?: NavRoute['href'];
};

export const nav: NavRoute[] = [
	{ href: '/', label: 'Home', icon: HouseIcon, sidebar: true },
	{ href: '/queue', label: 'Queue', icon: ListVideoIcon, sidebar: true },
	{ href: '/calendar', label: 'Calendar', icon: CalendarIcon, sidebar: true },
	{ href: '/brand', label: 'Brand memory', icon: BrainIcon, sidebar: true },
	{ href: '/settings', label: 'Settings', icon: SettingsIcon, sidebar: true },
	{ href: '/clips', label: 'Clip picker', icon: ScissorsIcon, sidebar: false, parent: '/queue' },
	{ href: '/editor', label: 'Editor', icon: FilmIcon, sidebar: false, parent: '/queue' },
	{ href: '/publish', label: 'Publish', icon: SendIcon, sidebar: false, parent: '/queue' }
];

/** Nav entry for a pathname (exact match on the first segment). */
export function navFor(pathname: string): NavRoute | undefined {
	const first = '/' + (pathname.split('/')[1] ?? '');
	return nav.find((r) => r.href === first);
}

/** Breadcrumb trail for a pathname, e.g. /editor → [Queue, Editor]. */
export function crumbsFor(pathname: string): NavRoute[] {
	const route = navFor(pathname);
	if (!route) return [];
	const parent = route.parent && nav.find((r) => r.href === route.parent);
	return parent ? [parent, route] : [route];
}
