import { fail } from '@sveltejs/kit';
import { platforms, type Platform } from '$lib/entities/post';
import { templateCaptions, type Caption } from '$lib/server/publishing/captions';
import { presignGet } from '$lib/server/r2';
import type { Actions, PageServerLoad } from './$types';

type ClipRow = {
	id: string;
	description: string | null;
	reason: string | null;
	render_path: string;
};

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	// RLS scopes everything to the user. "Not yet posted" = no live YouTube post for the clip.
	const [clips, live, conn] = await Promise.all([
		supabase
			.from('clips')
			.select('id, description, reason, render_path, created_at')
			.not('render_path', 'is', null)
			.order('created_at', { ascending: false }),
		supabase
			.from('posts')
			.select('clip_id')
			.eq('platform', 'youtube')
			.in('status', ['scheduled', 'publishing', 'posted']),
		supabase
			.from('platform_connections_public')
			.select('account_name')
			.eq('platform', 'youtube')
			.maybeSingle()
	]);
	if (clips.error) console.error('clips', clips.error);
	const taken = new Set((live.data ?? []).map((p) => p.clip_id));
	const rows = ((clips.data ?? []) as ClipRow[]).filter((c) => !taken.has(c.id));

	return {
		youtube: conn.data ? { account_name: conn.data.account_name as string | null } : null,
		clips: await Promise.all(
			rows.map(async (c) => ({
				id: c.id,
				description: c.description ?? c.reason ?? '',
				preview: await presignGet(c.render_path),
				// ponytail: brand defaults (CTA, hashtags) come from brand memory once plan 4/9 land.
				captions: Object.fromEntries(
					await Promise.all(
						platforms.map(async (p) => [p.id, await templateCaptions.generate(c, p.id, null)])
					)
				) as Record<Platform, Caption>
			}))
		)
	};
};

const MAX_FUTURE_MS = 180 * 864e5;

export const actions: Actions = {
	/** Create a scheduled YouTube post. Empty `scheduled_at` = post now (worker picks it up <60s). */
	schedule: async ({ request, locals: { supabase, user } }) => {
		const form = await request.formData();
		const clipId = String(form.get('clip_id') ?? '');
		const title = String(form.get('title') ?? '')
			.replace(/[<>]/g, '')
			.trim();
		const caption = String(form.get('caption') ?? '').replace(/[<>]/g, '');
		const tags = String(form.get('tags') ?? '')
			.split(',')
			.map((t) => t.trim().replace(/^#/, ''))
			.filter(Boolean)
			.slice(0, 30);
		const at = String(form.get('scheduled_at') ?? '');
		const when = at ? new Date(at) : new Date();

		if (!title || title.length > 100)
			return fail(400, { message: 'Titles need 1 to 100 characters.' });
		if (caption.length > 5000)
			return fail(400, { message: 'Descriptions can be at most 5000 characters.' });
		if (Number.isNaN(when.getTime())) return fail(400, { message: 'Pick a valid date and time.' });
		if (when.getTime() < Date.now() - 60_000)
			return fail(400, { message: 'Pick a time in the future.' });
		if (when.getTime() > Date.now() + MAX_FUTURE_MS)
			return fail(400, { message: 'Schedule at most 180 days ahead.' });

		const [clip, conn, live] = await Promise.all([
			supabase.from('clips').select('id, render_path').eq('id', clipId).maybeSingle(),
			supabase
				.from('platform_connections_public')
				.select('platform')
				.eq('platform', 'youtube')
				.maybeSingle(),
			supabase
				.from('posts')
				.select('id')
				.eq('clip_id', clipId)
				.eq('platform', 'youtube')
				.in('status', ['scheduled', 'publishing', 'posted'])
		]);
		if (!clip.data?.render_path) return fail(404, { message: 'Clip not found or not rendered.' });
		if (!conn.data) return fail(409, { message: 'Connect YouTube in Settings first.' });
		if (live.data?.length)
			return fail(409, { message: 'This clip is already scheduled or posted on YouTube.' });

		const { error } = await supabase.from('posts').insert({
			user_id: user!.id,
			clip_id: clipId,
			platform: 'youtube',
			status: 'scheduled',
			title,
			caption,
			tags,
			scheduled_at: when.toISOString()
		});
		if (error) {
			console.error('posts insert', error);
			return fail(500, { message: 'Could not schedule the post. Try again.' });
		}
		return { scheduled: true, now: !at };
	}
};
