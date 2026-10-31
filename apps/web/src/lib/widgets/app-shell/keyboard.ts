import { goKeys, type NavRoute } from '$lib/shared/config';
import { isTyping } from '$lib/shared/lib/is-typing';

type Handlers = { palette: () => void; help: () => void; go: (href: NavRoute['href']) => void };

/**
 * One keydown handler for the shell: Mod+K, "G then X" (1s window), and "?".
 * Mod+B is handled by the shadcn sidebar itself. Bindings are listed in $lib/shared/config/shortcuts.ts.
 */
export function createKeyHandler(h: Handlers) {
	let gAt = 0;
	return (e: KeyboardEvent) => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			h.palette();
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
		const key = e.key.toLowerCase();
		if (gAt && Date.now() - gAt < 1000 && goKeys[key]) {
			e.preventDefault();
			gAt = 0;
			h.go(goKeys[key]);
		} else if (key === 'g') {
			gAt = Date.now();
		} else if (e.key === '?') {
			e.preventDefault();
			h.help();
		} else {
			gAt = 0;
		}
	};
}
