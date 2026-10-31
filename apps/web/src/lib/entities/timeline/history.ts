// Undo/redo stack of timeline states. Pure: every function returns a new History.
export type Entry<T> = { value: T; summary: string };
export type History<T> = { past: Entry<T>[]; present: Entry<T>; future: Entry<T>[] };

const LIMIT = 200;

export const initHistory = <T>(value: T): History<T> => ({
	past: [],
	present: { value, summary: 'Opened' },
	future: []
});

export const push = <T>(h: History<T>, value: T, summary: string): History<T> => ({
	past: [...h.past, h.present].slice(-LIMIT),
	present: { value, summary },
	future: []
});

/** Returns null when there is nothing to undo. `undone` is the summary of the reverted edit. */
export function undo<T>(h: History<T>): { history: History<T>; undone: string } | null {
	const prev = h.past.at(-1);
	if (!prev) return null;
	return {
		history: { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] },
		undone: h.present.summary
	};
}

export function redo<T>(h: History<T>): { history: History<T>; redone: string } | null {
	const next = h.future[0];
	if (!next) return null;
	return {
		history: { past: [...h.past, h.present], present: next, future: h.future.slice(1) },
		redone: next.summary
	};
}
