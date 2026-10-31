// Docs: docs/auth-and-keys.md
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Google → Supabase → here with ?code=…; trade it for a session cookie (PKCE).
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get('code');
	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) redirect(303, '/');
		console.error('exchangeCodeForSession failed', error);
	}
	redirect(303, '/login?error=callback');
};
