import { error, redirect } from '@sveltejs/kit';
import { SIDEBAR_COOKIE_NAME } from '$lib/shared/ui/sidebar/constants';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { supabase, user }, cookies }) => {
	// First login: no brand profile yet → onboarding. RLS limits the query to the user's own row.
	const { data, error: err } = await supabase
		.from('brand_profile')
		.select('user_id')
		.eq('user_id', user!.id)
		.maybeSingle();
	if (err) {
		console.error('brand_profile lookup failed', err);
		error(500, 'Could not load your profile.');
	}
	if (!data) redirect(303, '/onboarding');

	return { sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) !== 'false' };
};
