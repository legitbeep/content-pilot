import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { env } from '$env/dynamic/public';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	// Re-run when the session changes (see onAuthStateChange in +layout.svelte).
	depends('supabase:auth');

	const url = env.PUBLIC_SUPABASE_URL ?? '';
	const key = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
	const supabase = isBrowser()
		? createBrowserClient(url, key, { global: { fetch } })
		: createServerClient(url, key, {
				global: { fetch },
				cookies: { getAll: () => data.cookies }
			});

	// getSession is fine here: the server already validated the session in hooks.server.ts.
	const {
		data: { session }
	} = await supabase.auth.getSession();
	const {
		data: { user }
	} = await supabase.auth.getUser();

	return { session, supabase, user };
};
