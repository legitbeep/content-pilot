import { describe, expect, it } from 'vitest';
import { templateCaptions } from './captions';

const clip = { id: 'c', description: 'Hooks fail fast. Open on the <payoff>.', reason: null };

describe('templateCaptions', () => {
	it('titles from the hook and adds CTA + hashtags', async () => {
		const c = await templateCaptions.generate(clip, 'youtube', null);
		expect(c.title).toBe('Hooks fail fast');
		expect(c.description).toBe(
			'Hooks fail fast. Open on the payoff.\n\nFollow for more.\n\n#shorts #creator'
		);
		expect(c.tags).toEqual(['shorts', 'creator']);
	});
	it('uses brand defaults and keeps X under 280 chars', async () => {
		const long = { ...clip, description: 'word '.repeat(100) };
		const c = await templateCaptions.generate(long, 'x', { hashtags: ['#ai'] });
		expect(c.description.length).toBeLessThanOrEqual(280);
		expect(c.description.endsWith(' #ai')).toBe(true);
	});
});
