import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandProfile } from '$lib/entities/brand';

const calls: { task: string; system: string; prompt: string }[] = [];
let reply: unknown;
vi.mock('../llm', () => ({
	generateJSON: vi.fn(async (o: { task: string; system: string; prompt: string }) => {
		calls.push(o);
		return { data: reply };
	})
}));
vi.mock('../brand', () => ({
	loadBrand: async () => ({
		profile: BrandProfile.parse({
			name: 'Clean Living',
			banned_words: ['hustle'],
			default_cta: 'Follow for daily tips.'
		})
	})
}));

const { generateCaptions, logCaptionEdit } = await import('./llm-captions');

function supabase(inserted: unknown[] = []) {
	return {
		from: (table: string) => ({
			select: async () => ({
				data:
					table === 'brand_rules'
						? [
								{
									rule: 'Write captions in Hinglish.',
									scope: 'copy',
									status: 'active',
									evidence_count: 0
								},
								{ rule: 'Candidate only.', scope: 'copy', status: 'candidate', evidence_count: 3 }
							]
						: []
			}),
			insert: async (row: unknown) => {
				inserted.push(row);
				return { error: null };
			}
		})
	} as never;
}

beforeEach(() => {
	calls.length = 0;
	reply = {
		youtube: {
			title: 'Why <20 seconds> of handwashing matters '.repeat(5),
			description: 'Germs hide. Here is how to beat them.\nFollow for daily tips.',
			tags: ['#hygiene', 'handwashing']
		},
		instagram: { caption: 'Your hands, 20 seconds.', hashtags: ['hygiene', '#health'] },
		linkedin: { text: 'Small habits compound. Handwashing is one.' },
		x: { text: 'x'.repeat(400) }
	};
});

describe('generateCaptions', () => {
	it('sends brand memory (scope copy) and the clip, one call for every platform', async () => {
		await generateCaptions(supabase(), 'u1', {
			description: 'Handwashing for 20s',
			reason: null,
			words: [{ w: 'wash' }, { w: 'hands' }]
		});
		expect(calls).toHaveLength(1);
		expect(calls[0].task).toBe('captions');
		expect(calls[0].prompt).toContain('Write captions in Hinglish.');
		expect(calls[0].prompt).not.toContain('Candidate only.');
		expect(calls[0].prompt).toContain('hustle'); // banned words are part of the copy scope
		expect(calls[0].prompt).toContain('Clip transcript: wash hands');
	});

	it('applies platform limits and differs per platform', async () => {
		const c = await generateCaptions(supabase(), 'u1', {
			description: 'd',
			reason: null,
			words: null
		});
		expect(c.youtube.title.length).toBeLessThanOrEqual(100);
		expect(c.youtube.title).not.toMatch(/[<>]/);
		expect(c.youtube.tags).toEqual(['hygiene', 'handwashing']);
		expect(c.instagram.description).toBe('Your hands, 20 seconds.\n\n#hygiene #health');
		expect(c.x.description.length).toBeLessThanOrEqual(280);
		const texts = new Set(Object.values(c).map((p) => p.description));
		expect(texts.size).toBe(4);
	});
});

describe('logCaptionEdit', () => {
	it('logs a caption_edit event only when the text changed', async () => {
		const rows: unknown[] = [];
		await logCaptionEdit(
			supabase(rows),
			'u1',
			'c1',
			'x',
			{ description: 'a' },
			{ description: 'a' }
		);
		expect(rows).toHaveLength(0);
		await logCaptionEdit(
			supabase(rows),
			'u1',
			'c1',
			'x',
			{ description: 'a' },
			{ description: 'b' }
		);
		expect(rows).toEqual([
			{
				user_id: 'u1',
				clip_id: 'c1',
				op: 'caption_edit',
				source: 'manual',
				args: { platform: 'x', before: { description: 'a' }, after: { description: 'b' } },
				summary: 'Edited the x caption'
			}
		]);
	});
});
