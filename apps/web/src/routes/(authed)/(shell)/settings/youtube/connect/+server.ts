// Docs: docs/publishing.md
import { redirect } from '@sveltejs/kit';
import { authUrl } from '$lib/server/youtube';
import type { RequestHandler } from './$types';

/** Start YouTube connect: CSRF state in a short-lived cookie, then off to Google.
 * `?next=/onboarding` returns there instead of Settings (only these two, no open redirect). */
export const GET: RequestHandler = ({ url, cookies }) => {
	const state = crypto.randomUUID();
	const opts = { path: '/settings/youtube', httpOnly: true, maxAge: 600 };
	cookies.set('yt_oauth_state', state, opts);
	cookies.set(
		'yt_oauth_next',
		url.searchParams.get('next') === '/onboarding' ? '/onboarding' : '/settings',
		opts
	);
	redirect(303, authUrl(url.origin, state));
};
