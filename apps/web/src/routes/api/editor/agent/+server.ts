// Docs: docs/agent.md
// POST {clipId, message, timeline} → SSE events: status, understood {request, side_notes},
// plan {steps, reply, destructive}, error {message}. Nothing is applied here; the editor runs the plan.
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { Timeline } from '$lib/entities/timeline';
import { isDestructive } from '$lib/features/editor-agent';
import { planEdits, PlanError, understand } from '$lib/server/agent';
import { loadSession } from '$lib/server/agent/session';
import { AIError, requireAIKeys } from '$lib/server/llm';
import type { RequestHandler } from './$types';

const Body = z.object({
	clipId: z.string().uuid(),
	message: z.string().trim().min(1).max(4000),
	timeline: Timeline
});

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Sign in first.');
	const body = Body.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid request.');
	await requireAIKeys(user.id, 'llm');
	const session = await loadSession(supabase, user.id, body.data.clipId);

	const enc = new TextEncoder();
	const stream = new ReadableStream({
		async start(ctrl) {
			const send = (event: string, data: unknown) =>
				ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			try {
				send('status', { text: 'Understanding your request…' });
				const understood = await understand(user.id, body.data.message);
				send('understood', understood);
				if (!understood.request) {
					send('plan', {
						steps: [],
						reply: 'Nothing to edit in that message.',
						destructive: false
					});
					return;
				}
				send('status', { text: 'Planning…' });
				const plan = await planEdits(
					{ userId: user.id, ...session, timeline: body.data.timeline },
					understood.request
				);
				send('plan', { ...plan, destructive: isDestructive(plan.steps) });
			} catch (e) {
				if (!(e instanceof AIError || e instanceof PlanError)) console.error('agent failed', e);
				send('error', {
					message:
						e instanceof AIError || e instanceof PlanError
							? e.message
							: 'Something went wrong planning that. Try again.'
				});
			} finally {
				ctrl.close();
			}
		}
	});
	return new Response(stream, {
		headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }
	});
};
