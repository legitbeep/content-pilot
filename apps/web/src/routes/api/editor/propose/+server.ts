// Docs: docs/agent.md
// POST {clipId, rule, scope, message} → the agent's propose_memory_update. Writes only a
// `candidate` brand rule (or adds evidence to one); the user activates it on /brand.
import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { MemoryProposal } from '$lib/features/editor-agent';
import { proposeRule } from '$lib/server/agent/learn';
import type { RequestHandler } from './$types';

const Body = MemoryProposal.extend({
	clipId: z.string().uuid(),
	message: z.string().max(4000).default('')
});

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Sign in first.');
	const body = Body.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid rule suggestion.');
	return json(await proposeRule(supabase, user.id, body.data));
};
