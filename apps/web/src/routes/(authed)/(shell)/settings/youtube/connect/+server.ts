// Docs: docs/publishing.md
import { redirect } from '@sveltejs/kit';
import { authUrl } from '$lib/server/youtube';
import type { RequestHandler } from './$types';

/** Start YouTube connect: CSRF state in a short-lived cookie, then off to Google. */
export const GET: RequestHandler = ({ url, cookies }) => {
	const state = crypto.randomUUID();
	cookies.set('yt_oauth_state', state, { path: '/settings/youtube', httpOnly: true, maxAge: 600 });
	redirect(303, authUrl(url.origin, state));
};
