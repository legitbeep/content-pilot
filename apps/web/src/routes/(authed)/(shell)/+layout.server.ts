import { error, redirect } from '@sveltejs/kit';
import { SIDEBAR_COOKIE_NAME } from '$lib/shared/ui/sidebar/constants';
import { aiCapabilities, type ApiKey } from '$lib/entities/api-key';
import { isDemoUser } from '$lib/server/llm';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { supabase, user }, cookies }) => {
	// Onboarding not finished (no row, or no onboarding_completed_at) → onboarding. RLS limits the
	// query to the user's own row. Dev login sets onboarding_completed_at for its test user.
	const { data, error: err } = await supabase
		.from('brand_profile')
		.select('onboarding_completed_at')
		.eq('user_id', user!.id)
		.maybeSingle();
	if (err) {
		console.error('brand_profile lookup failed', err);
		error(500, 'Could not load your profile.');
	}
	if (!data?.onboarding_completed_at) redirect(303, '/onboarding');

	// page.data.ai drives every AI button (<RequiresAI>, docs/llm.md). Demo = verified session email.
	const keys = await supabase.from('user_keys_public').select('provider, invalid_at');
	return {
		sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) !== 'false',
		ai: aiCapabilities((keys.data ?? []) as ApiKey[], isDemoUser(user))
	};
};
