// Docs: docs/queue.md
// Allowed job state transitions and the user actions available in each state. Server routes call
// canTransition()/can() before writing; docs/queue.md mirrors these tables.
import type { JobStatus } from './model';

export const transitions: Record<JobStatus, JobStatus[]> = {
	pending: ['processing', 'stopped'],
	processing: ['done', 'failed', 'stopped', 'needs_input'],
	needs_input: ['pending'],
	done: [],
	stopped: ['pending'],
	failed: ['pending']
};

export const canTransition = (from: JobStatus, to: JobStatus) => transitions[from].includes(to);

export type JobAction =
	'reorder' | 'edit_request' | 'delete' | 'stop' | 'answer' | 'open_clips' | 'requeue' | 'retry';

export const actionsFor: Record<JobStatus, JobAction[]> = {
	pending: ['reorder', 'edit_request', 'delete'],
	processing: ['stop'],
	needs_input: ['answer', 'delete'], // delete = the question's "Cancel"
	done: ['open_clips'],
	stopped: ['requeue', 'delete'],
	failed: ['retry', 'delete']
};

export const can = (status: JobStatus, action: JobAction) => actionsFor[status].includes(action);

/** Status an action moves the job to, if it changes status at all (stop is applied by the worker). */
export const actionTarget: Partial<Record<JobAction, JobStatus>> = {
	answer: 'pending',
	requeue: 'pending',
	retry: 'pending'
};
