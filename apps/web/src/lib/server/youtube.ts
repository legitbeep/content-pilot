// Docs: docs/publishing.md
// YouTube connect: Google OAuth with our own client (not Supabase login). Endpoints and scopes
// checked against developers.google.com/youtube/v3/guides/auth/server-side-web-apps (2026-10-31).
import { env } from '$env/dynamic/private';
import { decrypt, encrypt, fromBytea, toBytea } from './crypto';
import { supabaseAdmin } from './supabase-admin';

export const YOUTUBE_SCOPES = [
	'https://www.googleapis.com/auth/youtube.upload',
	'https://www.googleapis.com/auth/youtube.readonly',
	'https://www.googleapis.com/auth/yt-analytics.readonly'
];

/** Registered redirect URI; falls back to this origin's callback route. */
export const redirectUri = (origin: string) =>
	env.YOUTUBE_REDIRECT_URI || `${origin}/settings/youtube/callback`;

function clientId() {
	if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET)
		throw new Error('YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET are not set (apps/web/.env)');
	return env.YOUTUBE_CLIENT_ID;
}

export function authUrl(origin: string, state: string): string {
	const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	u.search = new URLSearchParams({
		client_id: clientId(),
		redirect_uri: redirectUri(origin),
		response_type: 'code',
		scope: YOUTUBE_SCOPES.join(' '),
		access_type: 'offline',
		prompt: 'consent',
		include_granted_scopes: 'true',
		state
	}).toString();
	return u.toString();
}

type Tokens = { access_token: string; refresh_token?: string; scope?: string };

/** Exchange the callback code, look up the channel and store the encrypted refresh token. */
export async function connectYoutube(userId: string, code: string, origin: string) {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		body: new URLSearchParams({
			code,
			client_id: clientId(),
			client_secret: env.YOUTUBE_CLIENT_SECRET!,
			redirect_uri: redirectUri(origin),
			grant_type: 'authorization_code'
		})
	});
	if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
	const tokens = (await res.json()) as Tokens;
	if (!tokens.refresh_token) throw new Error('Google returned no refresh token');
	if (!YOUTUBE_SCOPES.every((s) => tokens.scope?.includes(s))) throw new Error('missing_scopes');

	const ch = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
		headers: { Authorization: `Bearer ${tokens.access_token}` }
	});
	if (!ch.ok) throw new Error(`channels.list ${ch.status}: ${await ch.text()}`);
	const item = ((await ch.json()) as { items?: ChannelItem[] }).items?.[0];
	if (!item) throw new Error('no_channel');

	const { iv, ciphertext } = await encrypt(tokens.refresh_token, env.ENCRYPTION_KEY ?? '');
	const { error } = await supabaseAdmin()
		.from('platform_connections')
		.upsert(
			{
				user_id: userId,
				platform: 'youtube',
				refresh_token_ciphertext: toBytea(ciphertext),
				iv: toBytea(iv),
				account_name: item.snippet.title,
				channel_id: item.id,
				avatar_url: item.snippet.thumbnails?.default?.url ?? null,
				connected_at: new Date().toISOString(),
				baselines_seeded_at: null // plan 9: the checkpoints loop (re)seeds baselines
			},
			{ onConflict: 'user_id,platform' }
		);
	if (error) throw new Error(`platform_connections upsert: ${error.message}`);
}

type ChannelItem = {
	id: string;
	snippet: { title: string; thumbnails?: { default?: { url: string } } };
};

/** Revoke at Google (best effort; an already-revoked token is fine) and delete the row. */
export async function disconnectYoutube(userId: string) {
	const admin = supabaseAdmin();
	const { data } = await admin
		.from('platform_connections')
		.select('refresh_token_ciphertext, iv')
		.eq('user_id', userId)
		.eq('platform', 'youtube')
		.maybeSingle();
	if (data) {
		try {
			const token = await decrypt(
				fromBytea(data.refresh_token_ciphertext),
				fromBytea(data.iv),
				env.ENCRYPTION_KEY ?? ''
			);
			await fetch('https://oauth2.googleapis.com/revoke', {
				method: 'POST',
				body: new URLSearchParams({ token })
			});
		} catch (e) {
			console.error('youtube revoke', e);
		}
	}
	const { error } = await admin
		.from('platform_connections')
		.delete()
		.eq('user_id', userId)
		.eq('platform', 'youtube');
	if (error) throw new Error(`platform_connections delete: ${error.message}`);
}
