// Docs: docs/brand-memory.md
// POST {force?} → learn from edits. Called by the editor after each save (runs only at 25+ new
// events) and after "Finish all clips" (force). Returns rules newly ready to review + conflicts.
import { error, json } from '@sveltejs/kit';
import { learnFromEdits } from '$lib/server/agent/learn';
import { AIError, requireAIKeys } from '$lib/server/llm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Sign in first.');
	const body = (await request.json().catch(() => ({}))) as { force?: unknown };
	try {
		return json(
			await learnFromEdits(supabase, user.id, {
				force: body.force === true,
				beforeAI: () => requireAIKeys(user.id, 'llm').then(() => {})
			})
		);
	} catch (e) {
		if (!(e instanceof AIError)) throw e;
		error(e.kind === 'missing_key' ? 409 : 502, e.message);
	}
};
