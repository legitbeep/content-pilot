import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	env: { YOUTUBE_FAKE: 'true' } as Record<string, string>,
	connected: true,
	prompts: [] as string[],
	picks: [] as { videoId: string; reason: string }[]
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('./supabase-admin', () => ({
	supabaseAdmin: () => ({
		from: () => ({
			select: () => ({
				eq: () => ({
					eq: () => ({
						maybeSingle: async () => ({
							data: state.connected ? { refresh_token_ciphertext: '', iv: '' } : null
						})
					})
				})
			})
		})
	})
}));
vi.mock('./llm', () => ({
	generateJSON: async (o: { task: string; prompt: string }) => {
		expect(o.task).toBe('recommendations');
		state.prompts.push(o.prompt);
		return { data: { picks: state.picks } };
	}
}));

const { recommend, searchCandidates } = await import('./recommendations');
const profile = { niche: 'health', audience: 'students', core_topics: ['hygiene', 'habits'] };

beforeEach(() => {
	state.connected = true;
	state.prompts = [];
	state.picks = [
		{ videoId: 'dQx1fake001', reason: 'Matches your hygiene topic.' },
		{ videoId: 'invented', reason: 'Not a candidate.' },
		{ videoId: 'dQx1fake005', reason: 'Habit science fits your audience.' }
	];
});

describe('recommend', () => {
	it('needs a YouTube connection', async () => {
		state.connected = false;
		expect(await recommend('u1', profile, null)).toBe('not_connected');
	});

	it('searches CC long videos, adds trending titles, keeps only real candidates', async () => {
		const r = await recommend('u1', profile, 'IN');
		expect(r).toEqual([
			expect.objectContaining({
				videoId: 'dQx1fake001',
				license: 'Creative Commons',
				url: 'https://www.youtube.com/watch?v=dQx1fake001'
			}),
			expect.objectContaining({
				videoId: 'dQx1fake005',
				reason: 'Habit science fits your audience.'
			})
		]);
		const sent = JSON.parse(state.prompts[0]);
		expect(sent.trending_in_region).toContain('5 cleaning hacks your mom never told you');
		expect(sent.candidates).toHaveLength(6); // deduped across the two topic searches
	});

	it('skips trending without a region', async () => {
		await recommend('u1', profile, null);
		expect(JSON.parse(state.prompts[0]).trending_in_region).toEqual([]);
	});

	it('asks YouTube for Creative Commons, long videos (real request shape)', async () => {
		state.env.YOUTUBE_FAKE = '';
		const urls: string[] = [];
		vi.stubGlobal('fetch', async (u: string) => {
			urls.push(u);
			return new Response(JSON.stringify({ items: [] }));
		});
		try {
			await searchCandidates('tok', ['hygiene'], 'IN');
		} finally {
			vi.unstubAllGlobals();
			state.env.YOUTUBE_FAKE = 'true';
		}
		const search = new URL(urls[0]);
		expect(search.pathname).toBe('/youtube/v3/search');
		expect(search.searchParams.get('videoLicense')).toBe('creativeCommon');
		expect(search.searchParams.get('videoDuration')).toBe('long');
		expect(search.searchParams.get('type')).toBe('video');
		expect(new URL(urls[1]).searchParams.get('chart')).toBe('mostPopular');
	});
});
