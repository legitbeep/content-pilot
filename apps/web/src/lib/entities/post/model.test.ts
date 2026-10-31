import { describe, expect, it } from 'vitest';
import { canPost } from './model';

describe('canPost', () => {
	it('locks a post while the worker publishes it', () => {
		for (const a of ['reschedule', 'edit', 'cancel', 'retry', 'open'] as const)
			expect(canPost('publishing', a)).toBe(false);
	});
	it('offers status-specific actions', () => {
		expect(canPost('scheduled', 'edit')).toBe(true);
		expect(canPost('failed', 'retry')).toBe(true);
		expect(canPost('posted', 'open')).toBe(true);
		expect(canPost('posted', 'cancel')).toBe(false);
		expect(canPost('cancelled', 'retry')).toBe(false);
	});
});
