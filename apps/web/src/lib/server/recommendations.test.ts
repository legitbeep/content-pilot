import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	env: { YOUTUBE_FAKE: 'true' } as Record<string, string>,
	dev: true,
	connected: true,
	prompts: [] as string[],
	picks: [] as { videoId: string; reason: string }[]
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$app/environment', () => ({
	get dev() {
		return state.dev;
	}
}));
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

const { recommend, searchCandidates, searchTopics } = await import('./recommendations');
const memory = {
	memory: 'Niche: health\nCore topics: hygiene, habits',
	topics: ['hygiene', 'habits']
};

beforeEach(() => {
	state.connected = true;
	state.prompts = [];
	state.picks = [
		{ videoId: 'dQx1fake001', reason: 'Matches your hygiene topic.' },
		{ videoId: 'invented', reason: 'Not a candidate.' },
		{ videoId: 'dQx1fake005', reason: 'Habit science fits your audience.' }
	];
});

describe('searchTopics', () => {
	it('core topics first, then frequent clip topics, deduped, max 3', () => {
		expect(searchTopics(['Hygiene'], ['sleep', 'hygiene', 'diet', 'sleep'], 'health')).toEqual([
			'Hygiene',
			'sleep',
			'diet'
		]);
	});
	it('falls back to the niche, and to nothing', () => {
		expect(searchTopics([], [], 'health')).toEqual(['health']);
		expect(searchTopics([], [], '')).toEqual([]);
	});
});

describe('recommend', () => {
	it('needs a YouTube connection', async () => {
		state.connected = false;
		expect(await recommend('u1', memory)).toBe('not_connected');
	});

	it('needs at least one topic', async () => {
		expect(await recommend('u1', { memory: '', topics: [] })).toBe('no_topics');
	});

	it('searches CC long videos with brand memory, keeps only real candidates', async () => {
		const r = await recommend('u1', memory);
		expect(r).toEqual([
			expect.objectContaining({
				videoId: 'dQx1fake001',
				license: 'Creative Commons',
				url: 'https://www.youtube.com/watch?v=dQx1fake001',
				thumbnail: 'https://i.ytimg.com/vi/dQx1fake001/mqdefault.jpg'
			}),
			expect.objectContaining({
				videoId: 'dQx1fake005',
				reason: 'Habit science fits your audience.'
			})
		]);
		expect(state.prompts[0]).toContain('Core topics: hygiene, habits');
		expect(state.prompts[0]).not.toContain('trending');
	});

	it('asks YouTube for global Creative Commons, long videos (real request shape)', async () => {
		state.env.YOUTUBE_FAKE = '';
		const urls: string[] = [];
		vi.stubGlobal('fetch', async (u: string) => {
			urls.push(u);
			return new Response(JSON.stringify({ items: [] }));
		});
		try {
			await searchCandidates('tok', ['hygiene', 'habits']);
		} finally {
			vi.unstubAllGlobals();
			state.env.YOUTUBE_FAKE = 'true';
		}
		expect(urls).toHaveLength(2); // one search per topic, no trending call
		const search = new URL(urls[0]);
		expect(search.pathname).toBe('/youtube/v3/search');
		expect(search.searchParams.get('videoLicense')).toBe('creativeCommon');
		expect(search.searchParams.get('videoDuration')).toBe('long');
		expect(search.searchParams.get('type')).toBe('video');
		expect(search.searchParams.has('regionCode')).toBe(false);
		expect(search.searchParams.has('relevanceLanguage')).toBe(false);
	});

	it('dedupes candidates across topic searches', async () => {
		expect(await searchCandidates('tok', ['hygiene', 'habits'])).toHaveLength(6);
	});

	it('ignores YOUTUBE_FAKE in a production build (dev=false)', async () => {
		state.dev = false;
		const urls: string[] = [];
		vi.stubGlobal('fetch', async (u: string) => {
			urls.push(u);
			return new Response(JSON.stringify({ items: [] }));
		});
		try {
			await searchCandidates('tok', ['hygiene']);
		} finally {
			vi.unstubAllGlobals();
			state.dev = true;
		}
		expect(urls[0]).toContain('/youtube/v3/search');
	});
});
