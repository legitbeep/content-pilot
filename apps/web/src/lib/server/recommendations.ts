// Docs: docs/performance.md
// "Recommended long-form videos": YouTube search (Creative Commons + long) for the creator's core
// topics, the region's trending titles as a signal, then the LLM (task `recommendations`) picks
// 3-4 with a reason. Never downloads anything. YOUTUBE_FAKE=true reads recorded responses.
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { generateJSON } from './llm';
import { decrypt, fromBytea } from './crypto';
import { supabaseAdmin } from './supabase-admin';
import searchFixture from './youtube-fixtures/search_list.json';
import popularFixture from './youtube-fixtures/videos_most_popular.json';

const API = 'https://www.googleapis.com/youtube/v3';

export type Recommendation = {
	videoId: string;
	title: string;
	channel: string;
	license: 'Creative Commons';
	reason: string;
	url: string;
};
type SearchItem = {
	id: { videoId?: string };
	snippet: { title: string; channelTitle: string; description: string };
};
type Candidate = { videoId: string; title: string; channel: string; description: string };

export const Picks = z.object({
	picks: z.array(z.object({ videoId: z.string(), reason: z.string() })).max(4)
});

const fake = () => env.YOUTUBE_FAKE === 'true';

async function get(url: string, token: string): Promise<unknown> {
	if (fake()) return new URL(url).pathname.endsWith('/search') ? searchFixture : popularFixture;
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) throw new Error(`YouTube ${res.status}: ${(await res.text()).slice(0, 500)}`);
	return res.json();
}

/** Access token from the user's stored YouTube connection; null when not connected. */
async function accessToken(userId: string): Promise<string | null> {
	const { data } = await supabaseAdmin()
		.from('platform_connections')
		.select('refresh_token_ciphertext, iv')
		.eq('user_id', userId)
		.eq('platform', 'youtube')
		.maybeSingle();
	if (!data) return null;
	if (fake()) return 'fake-token';
	const refresh = await decrypt(
		fromBytea(data.refresh_token_ciphertext),
		fromBytea(data.iv),
		env.ENCRYPTION_KEY ?? ''
	);
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		body: new URLSearchParams({
			client_id: env.YOUTUBE_CLIENT_ID ?? '',
			client_secret: env.YOUTUBE_CLIENT_SECRET ?? '',
			refresh_token: refresh,
			grant_type: 'refresh_token'
		})
	});
	if (!res.ok) throw new Error('youtube_reconnect');
	return ((await res.json()) as { access_token: string }).access_token;
}

export async function searchCandidates(token: string, topics: string[], region: string | null) {
	const params = (q: string) =>
		new URLSearchParams({
			part: 'snippet',
			type: 'video',
			videoLicense: 'creativeCommon',
			videoDuration: 'long',
			maxResults: '10',
			q,
			...(region ? { regionCode: region } : {})
		});
	const lists = await Promise.all(
		topics.slice(0, 3).map((t) => get(`${API}/search?${params(t)}`, token))
	);
	const seen = new Map<string, Candidate>();
	for (const l of lists)
		for (const i of (l as { items?: SearchItem[] }).items ?? [])
			if (i.id.videoId && !seen.has(i.id.videoId))
				seen.set(i.id.videoId, {
					videoId: i.id.videoId,
					title: i.snippet.title,
					channel: i.snippet.channelTitle,
					description: i.snippet.description.slice(0, 200)
				});
	let trending: string[] = [];
	if (region) {
		const p = new URLSearchParams({
			part: 'snippet',
			chart: 'mostPopular',
			regionCode: region,
			maxResults: '10'
		});
		const pop = (await get(`${API}/videos?${p}`, token)) as {
			items?: { snippet: { title: string } }[];
		};
		trending = (pop.items ?? []).map((i) => i.snippet.title);
	}
	return { candidates: [...seen.values()], trending };
}

const SYSTEM = `You help a short-form creator choose long-form source videos to cut clips from.
Pick the 3 or 4 candidates that best fit the creator's topics and audience and have clip-worthy moments. Use the region's trending titles only as a signal of what people watch now.
For each pick give a one-sentence reason specific to this creator. Only use videoId values from the candidates.
Return JSON: {"picks": [{"videoId": "...", "reason": "..."}]}`;

export async function recommend(
	userId: string,
	profile: { niche: string; audience: string; core_topics: string[] },
	region: string | null
): Promise<Recommendation[] | 'not_connected'> {
	const token = await accessToken(userId);
	if (!token) return 'not_connected';
	const topics = profile.core_topics.length ? profile.core_topics : [profile.niche].filter(Boolean);
	const { candidates, trending } = await searchCandidates(token, topics, region);
	if (!candidates.length) return [];
	const { data } = await generateJSON({
		userId,
		task: 'recommendations',
		schema: Picks,
		system: SYSTEM,
		prompt: JSON.stringify({
			creator: { niche: profile.niche, audience: profile.audience, core_topics: topics },
			trending_in_region: trending,
			candidates
		})
	});
	const byId = new Map(candidates.map((c) => [c.videoId, c]));
	return data.picks
		.filter((p) => byId.has(p.videoId))
		.map((p) => {
			const c = byId.get(p.videoId)!;
			return {
				videoId: c.videoId,
				title: c.title,
				channel: c.channel,
				license: 'Creative Commons' as const,
				reason: p.reason,
				url: `https://www.youtube.com/watch?v=${c.videoId}`
			};
		});
}
