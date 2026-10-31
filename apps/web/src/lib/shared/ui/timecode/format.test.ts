import { describe, expect, it } from 'vitest';
import { formatTimecode } from './format';

describe('formatTimecode', () => {
	it.each([
		[0, '00:00.0'],
		[83.42, '01:23.4'],
		[59.99, '00:59.9'],
		[3723.5, '1:02:03.5'],
		[-5, '00:00.0']
	])('%s → %s', (s, out) => expect(formatTimecode(s)).toBe(out));
});
