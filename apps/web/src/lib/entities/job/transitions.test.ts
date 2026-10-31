import { describe, expect, it } from 'vitest';
import { actionTarget, actionsFor, can, canTransition, transitions } from './transitions';
import type { JobStatus } from './model';

const all: JobStatus[] = ['pending', 'processing', 'needs_input', 'done', 'stopped', 'failed'];

describe('job transitions', () => {
	it('matches docs/queue.md', () => {
		expect(canTransition('pending', 'processing')).toBe(true);
		expect(canTransition('processing', 'stopped')).toBe(true);
		expect(canTransition('failed', 'pending')).toBe(true);
		expect(canTransition('done', 'pending')).toBe(false);
		expect(canTransition('pending', 'done')).toBe(false);
		expect(canTransition('stopped', 'processing')).toBe(false);
	});

	it('only allows actions listed for the state', () => {
		expect(can('pending', 'delete')).toBe(true);
		expect(can('processing', 'delete')).toBe(false);
		expect(can('processing', 'stop')).toBe(true);
		expect(can('failed', 'retry')).toBe(true);
		expect(can('stopped', 'retry')).toBe(false);
		expect(can('done', 'delete')).toBe(false);
	});

	it('every status-changing action is an allowed transition', () => {
		for (const from of all)
			for (const action of actionsFor[from]) {
				const to = actionTarget[action];
				if (to) expect(canTransition(from, to), `${from} -${action}-> ${to}`).toBe(true);
			}
	});

	it('done is terminal', () => expect(transitions.done).toEqual([]));
});
