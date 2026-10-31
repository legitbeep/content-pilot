import { fail } from '@sveltejs/kit';
import { aiFail, loadBrand } from '$lib/server/brand';
import { requireAIKeys } from '$lib/server/llm';
import { recommend } from '$lib/server/recommendations';
import type { HomeMetric, HomePost } from '$lib/widgets/performance';
import type { Actions, PageServerLoad } from './$types';

/** Home: posted clips + their checkpoint metrics, learning events (RLS: own rows). */
export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const [posts, metrics, log, conn] = await Promise.all([
		supabase
			.from('posts')
			.select('id, title, posted_at, external_url')
			.eq('status', 'posted')
			.not('posted_at', 'is', null)
			.order('posted_at', { ascending: false }),
		supabase.from('post_metrics').select('post_id, checkpoint, views, score, rating'),
		supabase
			.from('change_log')
			.select('id, kind, message, data')
			.order('created_at', { ascending: false })
			.limit(6),
		supabase
			.from('platform_connections_public')
			.select('platform')
			.eq('platform', 'youtube')
			.maybeSingle()
	]);
	for (const r of [posts, metrics, log]) if (r.error) console.error('home load', r.error.message);
	return {
		posts: (posts.data ?? []) as HomePost[],
		metrics: ((metrics.data ?? []) as HomeMetric[]).map((m) => ({
			...m,
			views: Number(m.views),
			score: m.score === null ? null : Number(m.score)
		})),
		changeLog: log.data ?? [],
		youtubeConnected: !!conn.data
	};
};

export const actions: Actions = {
	/** Rating nudge: 1-5 stars + note on the post's 7d metrics (extra evidence). */
	rate: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const rating = Number(form.get('rating'));
		if (!Number.isInteger(rating) || rating < 1 || rating > 5)
			return fail(400, { message: 'Pick 1 to 5 stars.' });
		const { data, error } = await supabase
			.from('post_metrics')
			.update({ rating, rating_note: String(form.get('note') ?? '').slice(0, 300) || null })
			.eq('post_id', String(form.get('post_id')))
			.eq('checkpoint', '7d')
			.select('id');
		if (error || !data?.length) return fail(404, { message: 'Could not save the rating.' });
		return { rated: true };
	},
	/** Recommended long-form videos (task `recommendations`). */
	recommend: async ({ request, locals: { supabase, user } }) => {
		await requireAIKeys(user!.id, 'llm');
		const raw = String((await request.formData()).get('region') ?? '')
			.trim()
			.toUpperCase();
		if (raw && !/^[A-Z]{2}$/.test(raw))
			return fail(400, { message: 'Region is a 2-letter country code, like IN or US.' });
		const { profile } = await loadBrand(supabase, user!.id);
		try {
			const r = await recommend(user!.id, profile, raw || null);
			if (r === 'not_connected')
				return fail(409, { message: 'Connect YouTube in Settings to get recommendations.' });
			return { recommendations: r };
		} catch (e) {
			if (e instanceof Error && e.message === 'youtube_reconnect')
				return fail(409, { message: 'YouTube access expired. Reconnect in Settings.' });
			if (e instanceof Error && e.message.startsWith('YouTube ')) {
				console.error('recommendations', e.message);
				return fail(502, { message: 'YouTube search failed. Try again later.' });
			}
			return aiFail(e);
		}
	}
};
