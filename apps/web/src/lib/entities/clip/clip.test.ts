import { describe, expect, it } from 'vitest';
import { excerpt, type ClipCandidate } from '.';

const clip = (words: string[]): ClipCandidate =>
	({
		start_s: 105,
		end_s: 107,
		file_start_s: 100,
		words: words.map((w, i) => ({ w, start: i, end: i + 0.8 }))
	}) as ClipCandidate;

describe('excerpt', () => {
	it('drops the handles and caps the length', () => {
		const c = clip(['h0', 'h1', 'h2', 'h3', 'h4', 'a', 'b', 'c', 'tail']);
		expect(excerpt(c)).toBe('a b');
		expect(excerpt({ ...c, end_s: 108 }, 2)).toBe('a b…');
	});
});
