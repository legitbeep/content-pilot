// Docs: docs/publishing.md
import { redirect } from '@sveltejs/kit';
import { connectYoutube } from '$lib/server/youtube';
import type { RequestHandler } from './$types';

/** Google → here. Store the encrypted refresh token, then back to Settings with a result flag. */
export const GET: RequestHandler = async ({ url, cookies, locals: { user } }) => {
	const state = cookies.get('yt_oauth_state');
	cookies.delete('yt_oauth_state', { path: '/settings/youtube' });
	const code = url.searchParams.get('code');
	if (!code || !state || url.searchParams.get('state') !== state)
		redirect(303, '/settings?youtube=denied');
	let result = 'connected';
	try {
		await connectYoutube(user!.id, code, url.origin);
	} catch (e) {
		console.error('youtube connect', e);
		const msg = e instanceof Error ? e.message : '';
		result = msg === 'missing_scopes' || msg === 'no_channel' ? msg : 'error';
	}
	redirect(303, `/settings?youtube=${result}`);
};
