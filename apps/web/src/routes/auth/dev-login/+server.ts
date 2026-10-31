// Docs: docs/auth-and-keys.md
import { error, redirect } from '@sveltejs/kit';
import { devLogin, devLoginEnabled } from '$lib/server/dev-login';
import type { RequestHandler } from './$types';

// GET (agents) and POST (login page button) both sign in as the test user and 303 to ?next (default /).
const handler: RequestHandler = async ({ url, locals: { supabase } }) => {
	if (!devLoginEnabled()) error(404, 'Not found');
	const message = await devLogin(supabase);
	if (message) error(500, `Dev login failed: ${message}`);
	const next = url.searchParams.get('next') ?? '/';
	redirect(303, next.startsWith('/') && !next.startsWith('//') ? next : '/');
};

export const GET = handler;
export const POST = handler;
