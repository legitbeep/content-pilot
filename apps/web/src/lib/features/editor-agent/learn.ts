// Ask the server to learn from recent edits; toast rules that are ready to review and conflicts.
// Learned rules are never activated here: the user reviews them on /brand. docs/brand-memory.md
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { toast } from 'svelte-sonner';

const review = {
	label: 'Review',
	// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path + query
	onClick: () => goto(`${resolve('/brand')}?tab=learned`)
};

/** `force`: run now (Finish all clips); otherwise the server runs only every 25 new edits. */
export async function learnFromEdits(force = false) {
	try {
		const res = await fetch('/api/editor/learn', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ force })
		});
		if (!res.ok) return;
		const r = (await res.json()) as {
			ready: string[];
			conflicts: { rule: string; stated: string }[];
		};
		for (const rule of r.ready) toast(`New rule ready to review: ${rule}`, { action: review });
		for (const c of r.conflicts)
			toast(`Your edits go against "${c.stated}". Pick which to keep.`, { action: review });
	} catch {
		// Learning is best effort; editing never waits on it.
	}
}
