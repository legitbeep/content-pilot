// Editor state: undo/redo history of the timeline, selection, playhead, and debounced autosave
// (compare-and-set on `revision`, edit events sent with each save). Plan 7's agent applies its
// ops through `apply(op, args, 'agent')` so they land in the same history and event log.
import { toast } from 'svelte-sonner';
import {
	applyOp,
	duration,
	initHistory,
	OpError,
	push,
	redo,
	undo,
	type EditEvent,
	type History,
	type Timeline
} from '$lib/entities/timeline';

export type SaveFn = (fields: {
	revision: number;
	timeline: Timeline;
	events: EditEvent[];
	render: boolean;
}) => Promise<{ revision: number }>;

export type Selection = { kind: 'segment'; index: number } | { kind: 'audio'; id: string } | null;

const AUTOSAVE_MS = 800;

export class EditorState {
	history: History<Timeline> = $state.raw()!;
	revision = $state(0);
	status: 'saved' | 'dirty' | 'saving' | 'error' = $state('saved');
	playhead = $state(0);
	playing = $state(false);
	selected: Selection = $state(null);
	markIn: number | null = $state(null);
	markOut: number | null = $state(null);
	/** R2 key → presigned GET URL (session clip files, timeline audio, new uploads). */
	urls: Record<string, string> = $state({});
	/** R2 key → media duration (s), filled as the preview loads metadata. */
	durations: Record<string, number> = $state({});

	timeline = $derived(this.history.present.value);
	total = $derived(duration(this.history.present.value));
	canUndo = $derived(this.history.past.length > 0);
	canRedo = $derived(this.history.future.length > 0);

	#events: EditEvent[] = [];
	#timer: ReturnType<typeof setTimeout> | undefined;
	#saving: Promise<void> = Promise.resolve();
	#save: SaveFn;

	constructor(timeline: Timeline, revision: number, urls: Record<string, string>, save: SaveFn) {
		this.history = initHistory(timeline);
		this.revision = revision;
		this.urls = urls;
		this.#save = save;
	}

	/** Apply a catalog op. Shows the error as a toast and returns false if it can't apply. */
	apply(op: string, args: unknown, source: EditEvent['source'] = 'manual'): boolean {
		try {
			const r = applyOp(this.timeline, op, args);
			this.history = push(this.history, r.timeline, r.summary);
			this.#log({ op, args, summary: r.summary, source });
			if (this.playhead > this.total) this.playhead = this.total;
			return true;
		} catch (e) {
			if (!(e instanceof OpError)) throw e;
			toast.error(e.message);
			return false;
		}
	}

	undo() {
		const r = undo(this.history);
		if (!r) return;
		this.history = r.history;
		this.#log({ op: 'undo', args: {}, summary: `Undid: ${r.undone}`, source: 'manual' });
	}

	redo() {
		const r = redo(this.history);
		if (!r) return;
		this.history = r.history;
		this.#log({ op: 'redo', args: {}, summary: `Redid: ${r.redone}`, source: 'manual' });
	}

	#log(e: EditEvent) {
		this.#events.push(e);
		this.status = 'dirty';
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.flush(), AUTOSAVE_MS);
	}

	/** Save now (saves run one at a time). `render` also queues a render of this clip.
	 * Resolves false if the save failed (a toast says why; the edits stay queued for the next save). */
	flush(render = false): Promise<boolean> {
		clearTimeout(this.#timer);
		const run = this.#saving.then(async () => {
			if (!this.#events.length && !render && this.status !== 'error') return true;
			const events = this.#events;
			this.#events = [];
			const timeline = this.timeline;
			this.status = 'saving';
			try {
				const r = await this.#save({ revision: this.revision, timeline, events, render });
				this.revision = r.revision;
				this.status = this.#events.length ? 'dirty' : 'saved';
				return true;
			} catch (e) {
				this.#events = [...events, ...this.#events];
				this.status = 'error';
				toast.error(e instanceof Error ? e.message : 'Could not save.');
				return false;
			}
		});
		this.#saving = run.then(() => {});
		return run;
	}
}
