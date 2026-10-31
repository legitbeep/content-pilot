import { getContext, setContext, type Snippet } from 'svelte';

const KEY = Symbol('topbar-actions');
export type TopbarSlot = { actions?: Snippet };

/** Called once by the app shell; returns the reactive slot the top bar renders. */
export function setTopbarSlot(slot: TopbarSlot) {
	return setContext(KEY, slot);
}
export const getTopbarSlot = () => getContext<TopbarSlot | undefined>(KEY);
