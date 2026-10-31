import { expect, it } from 'vitest';
import { groupTranscript } from './format';

it('groups utterances into 5-second paragraphs and skips empty buckets', () => {
	const u = (start: number, text: string) => ({ start, text });
	expect(
		groupTranscript([u(0.2, 'Hi.'), u(4.9, 'Welcome '), u(5, 'back.'), u(21, 'Later.')])
	).toEqual([
		{ start: 0, text: 'Hi. Welcome' },
		{ start: 5, text: 'back.' },
		{ start: 20, text: 'Later.' }
	]);
});
