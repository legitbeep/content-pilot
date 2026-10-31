import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { session }, cookies }) => {
	// hooks.server.ts already validated the session.
	return { session, cookies: cookies.getAll() };
};
