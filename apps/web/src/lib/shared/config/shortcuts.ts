// Docs: docs/design/design-system.md
// Every keyboard shortcut, in one place. The shell's key handler and the ? sheet both read this.
import type { NavRoute } from './nav';

export type Shortcut = {
	/** Keys as shown to the user, pressed in sequence ("G", "Q") or together ("Mod", "K"). */
	keys: string[];
	label: string;
} & (
	| { goto: NavRoute['href'] }
	| { action: 'palette' | 'sidebar' | 'help' }
	/** Handled by that page itself (e.g. the queue list), listed here so the ? sheet shows it. */
	| { page: '/queue'; action: QueueAction }
	| { page: '/editor'; action: EditorAction }
);

export type QueueAction = 'next' | 'prev' | 'open' | 'delete';
export type EditorAction =
	| 'play'
	| 'back'
	| 'pause'
	| 'forward'
	| 'split'
	| 'mark_in'
	| 'mark_out'
	| 'delete'
	| 'undo'
	| 'redo'
	| 'talk';

export const shortcuts: Shortcut[] = [
	{ keys: ['Mod', 'K'], label: 'Open command palette', action: 'palette' },
	{ keys: ['Mod', 'B'], label: 'Toggle sidebar', action: 'sidebar' },
	{ keys: ['?'], label: 'Show keyboard shortcuts', action: 'help' },
	{ keys: ['G', 'H'], label: 'Go to home', goto: '/' },
	{ keys: ['G', 'Q'], label: 'Go to queue', goto: '/queue' },
	{ keys: ['G', 'C'], label: 'Go to calendar', goto: '/calendar' },
	{ keys: ['G', 'B'], label: 'Go to brand memory', goto: '/brand' },
	{ keys: ['G', 'S'], label: 'Go to settings', goto: '/settings' },
	{ keys: ['J'], label: 'Queue: next job', page: '/queue', action: 'next' },
	{ keys: ['K'], label: 'Queue: previous job', page: '/queue', action: 'prev' },
	{ keys: ['Enter'], label: 'Queue: open job details', page: '/queue', action: 'open' },
	{ keys: ['Backspace'], label: 'Queue: delete job', page: '/queue', action: 'delete' },
	{ keys: ['Space'], label: 'Editor: play / pause', page: '/editor', action: 'play' },
	{ keys: ['J'], label: 'Editor: back 5s', page: '/editor', action: 'back' },
	{ keys: ['K'], label: 'Editor: pause', page: '/editor', action: 'pause' },
	{ keys: ['L'], label: 'Editor: play', page: '/editor', action: 'forward' },
	{ keys: ['S'], label: 'Editor: split at playhead', page: '/editor', action: 'split' },
	{ keys: ['I'], label: 'Editor: mark in', page: '/editor', action: 'mark_in' },
	{ keys: ['O'], label: 'Editor: mark out', page: '/editor', action: 'mark_out' },
	{
		keys: ['Backspace'],
		label: 'Editor: delete marked range or segment',
		page: '/editor',
		action: 'delete'
	},
	{ keys: ['Mod', 'Z'], label: 'Editor: undo', page: '/editor', action: 'undo' },
	{ keys: ['Shift', 'Mod', 'Z'], label: 'Editor: redo', page: '/editor', action: 'redo' },
	{ keys: ['V'], label: 'Editor: hold to talk to the agent', page: '/editor', action: 'talk' }
];

/** Key (as KeyboardEvent.key, lowercased) → queue action. */
export const queueKeys = Object.fromEntries(
	shortcuts.flatMap((s) =>
		'page' in s && s.page === '/queue' ? [[s.keys[0].toLowerCase(), s.action]] : []
	)
) as Record<string, QueueAction>;

const combo = (keys: string[]) =>
	keys.map((k) => (k === 'Space' ? ' ' : k.toLowerCase())).join('+');

/** A key event as a combo string matching `editorKeys`, e.g. "shift+mod+z", " ", "j". */
export const comboOf = (e: KeyboardEvent) =>
	[
		e.shiftKey && e.key.length === 1 && e.key !== ' ' ? 'shift' : '',
		e.metaKey || e.ctrlKey ? 'mod' : '',
		e.key.toLowerCase()
	]
		.filter(Boolean)
		.join('+');

/** Combo → editor action. */
export const editorKeys = Object.fromEntries(
	shortcuts.flatMap((s) => ('page' in s && s.page === '/editor' ? [[combo(s.keys), s.action]] : []))
) as Record<string, EditorAction>;

/** Second key of a "G then X" sequence → route. */
export const goKeys = Object.fromEntries(
	shortcuts.flatMap((s) =>
		'goto' in s && s.keys[0] === 'G' ? [[s.keys[1].toLowerCase(), s.goto]] : []
	)
) as Record<string, NavRoute['href']>;
