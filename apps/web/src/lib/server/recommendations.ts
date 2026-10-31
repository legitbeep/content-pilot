// Docs: docs/performance.md
// "Recommended long-form videos": YouTube search (Creative Commons + long, global, no region or
// language) for topics from brand memory (core topics + recent clip topics), then the LLM (task
// `recommendations`) picks 3-4 with a reason using the brand memory block. Never downloads
// anything. YOUTUBE_FAKE=true reads recorded responses.
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { buildMemoryContext, type MemoryRule } from '$lib/entities/brand';
import { loadBrand } from './brand';
import { generateJSON } from './llm';
import { decrypt, fromBytea } from './crypto';
import { supabaseAdmin } from './supabase-admin';
import searchFixture from './youtube-fixtures/search_list.json';

const API = 'https://www.googleapis.com/youtube/v3';

export type Recommendation = {
	videoId: string;
	title: string;
	channel: string;
	license: 'Creative Commons';
	reason: string;
	url: string;
	thumbnail: string | null;
};
type SearchItem = {
	id: { videoId?: string };
	snippet: {
		title: string;
		channelTitle: string;
		description: string;
		thumbnails?: { medium?: { url: string } };
	};
};
type Candidate = {
	videoId: string;
	title: string;
	channel: string;
	description: string;
	thumbnail: string | null;
};

export const Picks = z.object({
	picks: z.array(z.object({ videoId: z.string(), reason: z.string() })).max(4)
});

// Production builds have dev=false, so YOUTUBE_FAKE can never switch on there.
const fake = () => dev && env.YOUTUBE_FAKE === 'true';

async function get(url: string, token: string): Promise<unknown> {
	if (fake()) return searchFixture;
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

/**
 * Up to 3 search queries from brand memory: core topics first, then the most frequent recent clip
 * topics, niche when both are empty. Case-insensitive dedupe.
 */
export function searchTopics(coreTopics: string[], clipTopics: string[], niche: string): string[] {
	const counts = new Map<string, number>();
	for (const t of clipTopics) counts.set(t, (counts.get(t) ?? 0) + 1);
	const byFreq = [...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t);
	const seen = new Set<string>();
	const out: string[] = [];
	for (const t of [...coreTopics, ...byFreq, niche].map((x) => x.trim()))
		if (t && !seen.has(t.toLowerCase()) && out.length < 3) {
			seen.add(t.toLowerCase());
			out.push(t);
		}
	return out;
}

/** Brand memory for recommendations: prompt block (clip_selection scope) + search topics. */
export async function loadMemory(supabase: SupabaseClient, userId: string) {
	const [{ profile }, rules, clips] = await Promise.all([
		loadBrand(supabase, userId),
		supabase.from('brand_rules').select('rule, scope, status, evidence_count'),
		supabase
			.from('clips')
			.select('features')
			.not('features', 'is', null)
			.order('created_at', { ascending: false })
			.limit(30)
	]);
	const clipTopics = ((clips.data ?? []) as { features: { topic?: string } | null }[])
		.map((c) => c.features?.topic ?? '')
		.filter(Boolean);
	const topics = searchTopics(profile.core_topics, clipTopics, profile.niche);
	const memory = buildMemoryContext(profile, (rules.data ?? []) as MemoryRule[], {
		scope: 'clip_selection',
		topics
	});
	return { memory, topics };
}

export async function searchCandidates(token: string, topics: string[]) {
	const params = (q: string) =>
		new URLSearchParams({
			part: 'snippet',
			type: 'video',
			videoLicense: 'creativeCommon',
			videoDuration: 'long',
			maxResults: '10',
			q
		});
	const lists = await Promise.all(topics.map((t) => get(`${API}/search?${params(t)}`, token)));
	const seen = new Map<string, Candidate>();
	for (const l of lists)
		for (const i of (l as { items?: SearchItem[] }).items ?? [])
			if (i.id.videoId && !seen.has(i.id.videoId))
				seen.set(i.id.videoId, {
					videoId: i.id.videoId,
					title: i.snippet.title,
					channel: i.snippet.channelTitle,
					description: i.snippet.description.slice(0, 200),
					thumbnail: i.snippet.thumbnails?.medium?.url ?? null
				});
	return [...seen.values()];
}

const SYSTEM = `You help a short-form creator choose long-form source videos to cut clips from.
Pick the 3 or 4 candidates that best fit the creator's brand memory (topics, audience, rules) and have clip-worthy moments. Skip anything the memory says to never cover.
For each pick give a one-sentence reason specific to this creator. Only use videoId values from the candidates.
Return JSON: {"picks": [{"videoId": "...", "reason": "..."}]}`;

export async function recommend(
	userId: string,
	{ memory, topics }: { memory: string; topics: string[] }
): Promise<Recommendation[] | 'not_connected' | 'no_topics'> {
	if (!topics.length) return 'no_topics';
	const token = await accessToken(userId);
	if (!token) return 'not_connected';
	const candidates = await searchCandidates(token, topics);
	if (!candidates.length) return [];
	const { data } = await generateJSON({
		userId,
		task: 'recommendations',
		schema: Picks,
		system: SYSTEM,
		prompt: [
			`Brand memory:\n${memory || '(none yet)'}`,
			`Candidates:\n${JSON.stringify(candidates.map((c) => ({ ...c, thumbnail: undefined })))}`
		].join('\n\n')
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
				url: `https://www.youtube.com/watch?v=${c.videoId}`,
				thumbnail: c.thumbnail
			};
		});
}
