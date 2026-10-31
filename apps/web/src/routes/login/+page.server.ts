import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ locals: { supabase }, url }) => {
		const { data, error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${url.origin}/auth/callback` }
		});
		if (error) {
			console.error('Google sign-in failed to start', error);
			return fail(500, { message: 'Could not start Google sign-in. Try again.' });
		}
		redirect(303, data.url);
	}
};
