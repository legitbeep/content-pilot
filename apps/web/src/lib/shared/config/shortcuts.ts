// Docs: docs/design/design-system.md
// Every keyboard shortcut, in one place. The shell's key handler and the ? sheet both read this.
import type { NavRoute } from './nav';

export type Shortcut = {
	/** Keys as shown to the user, pressed in sequence ("G", "Q") or together ("Mod", "K"). */
	keys: string[];
	label: string;
} & ({ goto: NavRoute['href'] } | { action: 'palette' | 'sidebar' | 'help' });

export const shortcuts: Shortcut[] = [
	{ keys: ['Mod', 'K'], label: 'Open command palette', action: 'palette' },
	{ keys: ['Mod', 'B'], label: 'Toggle sidebar', action: 'sidebar' },
	{ keys: ['?'], label: 'Show keyboard shortcuts', action: 'help' },
	{ keys: ['G', 'H'], label: 'Go to home', goto: '/' },
	{ keys: ['G', 'Q'], label: 'Go to queue', goto: '/queue' },
	{ keys: ['G', 'C'], label: 'Go to calendar', goto: '/calendar' },
	{ keys: ['G', 'B'], label: 'Go to brand memory', goto: '/brand' },
	{ keys: ['G', 'S'], label: 'Go to settings', goto: '/settings' }
];

/** Second key of a "G then X" sequence → route. */
export const goKeys = Object.fromEntries(
	shortcuts.flatMap((s) =>
		'goto' in s && s.keys[0] === 'G' ? [[s.keys[1].toLowerCase(), s.goto]] : []
	)
) as Record<string, NavRoute['href']>;
