/** True when a key event comes from a text field, so single-key shortcuts should be ignored. */
export const isTyping = (t: EventTarget | null) =>
	t instanceof HTMLElement &&
	(t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
