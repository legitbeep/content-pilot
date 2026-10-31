import { fail, redirect } from '@sveltejs/kit';
import { accessCodeLogin, accessCodesEnabled } from '$lib/server/access-codes';
import { devLoginEnabled } from '$lib/server/dev-login';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	devLogin: devLoginEnabled(),
	accessCodes: accessCodesEnabled()
});

export const actions: Actions = {
	google: async ({ locals: { supabase }, url }) => {
		const { data, error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${url.origin}/auth/callback` }
		});
		if (error) {
			console.error('Google sign-in failed to start', error);
			return fail(500, { message: 'Could not start Google sign-in. Try again.' });
		}
		redirect(303, data.url);
	},
	// Judge access code: 6 digits → that code's own account (new accounts go through onboarding).
	code: async ({ request, locals: { supabase }, getClientAddress }) => {
		const code = String((await request.formData()).get('code') ?? '').trim();
		const message = await accessCodeLogin(supabase, code, getClientAddress());
		if (message) return fail(400, { codeMessage: message });
		redirect(303, '/');
	}
};
