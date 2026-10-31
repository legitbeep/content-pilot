// Docs: docs/auth-and-keys.md
import { createServerClient } from '@supabase/ssr';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

// /dev/* (the /dev/ui review page) skips Supabase and the guard in dev, so the design system can
// be reviewed before auth is configured. Outside dev those routes 404 behind the guard.
const isDevRoute = (path: string) => dev && path.startsWith('/dev/');

const supabase: Handle = async ({ event, resolve }) => {
	if (isDevRoute(event.url.pathname)) return resolve(event);

	event.locals.supabase = createServerClient(
		env.PUBLIC_SUPABASE_URL ?? '',
		env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					// path '/' is required by SvelteKit's cookies API.
					cookiesToSet.forEach(({ name, value, options }) =>
						event.cookies.set(name, value, { ...options, path: '/' })
					);
				}
			}
		}
	);

	// getSession() alone trusts the cookie; getUser() validates the JWT with Supabase Auth.
	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) return { session: null, user: null };
		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error) return { session: null, user: null };
		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (isDevRoute(path)) return resolve(event);

	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	const isPublic = path === '/login' || path.startsWith('/auth/');
	if (!session && !isPublic) redirect(303, '/login');
	if (session && path === '/login') redirect(303, '/');
	return resolve(event);
};

export const handle = sequence(supabase, authGuard);
