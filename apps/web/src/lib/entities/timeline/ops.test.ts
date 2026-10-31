import { describe, expect, it } from 'vitest';
import { newTimeline } from '@clip-studio/timeline-schema';
import { applyOp, duration, initHistory, locate, opCatalog, OpError, push, redo, undo } from '.';

const base = () => {
	const t = newTimeline('clips/a/source.mp4', 5, 15);
	t.segments.push({ start: 20, end: 25 });
	return t; // output: [0,10) from 5-15, [10,15) from 20-25
};
const run = (name: string, args: unknown, t = base()) => applyOp(t, name, args);

describe('ops', () => {
	it('every catalog entry has a name, description and args schema', () => {
		expect(opCatalog.map((o) => o.name)).toEqual([
			'trim', 'split', 'delete_range', 'reorder', 'merge_clip', 'mute_track', 'set_volume',
			'add_audio', 'remove_audio', 'set_ducking', 'set_aspect', 'set_crop_offset',
			'blur_region', 'add_text_overlay', 'toggle_captions', 'set_caption_style'
		]); // prettier-ignore
		for (const o of opCatalog) expect(o.description.length).toBeGreaterThan(10);
		expect(opCatalog.filter((o) => o.destructive).map((o) => o.name)).toEqual([
			'delete_range',
			'remove_audio'
		]);
	});

	it('does not mutate its input', () => {
		const t = base();
		const before = structuredClone(t);
		run('split', { at: 3 }, t);
		expect(t).toEqual(before);
	});

	it('trim', () => {
		const r = run('trim', { segment: 0, start: 2, end: 14 });
		expect(r.timeline.segments[0]).toEqual({ start: 2, end: 14 });
		expect(r.summary).toBe('Trimmed segment 1 to 2.0s-14.0s');
		expect(() => run('trim', { segment: 5, start: 1 })).toThrow(OpError);
		expect(() => run('trim', { segment: 0, start: 15 })).toThrow(/at least 0.1s/);
	});

	it('split', () => {
		const r = run('split', { at: 12 });
		expect(r.timeline.segments).toEqual([
			{ start: 5, end: 15 },
			{ start: 20, end: 22 },
			{ start: 22, end: 25 }
		]);
		expect(() => run('split', { at: 10 })).toThrow(/inside a segment/);
	});

	it('delete_range across a cut', () => {
		const r = run('delete_range', { start: 8, end: 12 });
		expect(r.timeline.segments).toEqual([
			{ start: 5, end: 13 },
			{ start: 22, end: 25 }
		]);
		expect(duration(r.timeline)).toBe(11);
		expect(() => run('delete_range', { start: 0, end: 15 })).toThrow(/whole clip/);
	});

	it('delete_range inside one segment keeps both sides', () => {
		const r = run('delete_range', { start: 2, end: 4 });
		expect(r.timeline.segments.slice(0, 2)).toEqual([
			{ start: 5, end: 7 },
			{ start: 9, end: 15 }
		]);
	});

	it('reorder', () => {
		expect(run('reorder', { from: 1, to: 0 }).timeline.segments[0]).toEqual({ start: 20, end: 25 });
	});

	it('merge_clip adds a segment from another file', () => {
		const r = run('merge_clip', { sourceKey: 'clips/b/source.mp4', start: 1, end: 4 });
		expect(r.timeline.segments.at(-1)).toEqual({
			start: 1,
			end: 4,
			sourceKey: 'clips/b/source.mp4'
		});
		const same = run('merge_clip', { sourceKey: 'clips/a/source.mp4', start: 0, end: 1, at: 0 });
		expect(same.timeline.segments[0]).toEqual({ start: 0, end: 1 });
	});

	it('audio: add, mute, volume, remove, ducking', () => {
		let t = run('add_audio', { kind: 'music', key: 'uploads/u/m.m4a' }).timeline;
		t = applyOp(t, 'add_audio', { kind: 'voiceover', key: 'uploads/u/v.m4a', start: 2 }).timeline;
		expect(t.audio.map((a) => a.id)).toEqual(['music-1', 'voiceover-1']);
		const muted = applyOp(t, 'mute_track', { track: 'original', muted: true });
		expect(muted.timeline.originalAudio.muted).toBe(true);
		expect(muted.summary).toBe('Muted original audio');
		t = applyOp(t, 'set_volume', { track: 'music-1', volume: 0.3 }).timeline;
		expect(t.audio[0].volume).toBe(0.3);
		expect(() => applyOp(t, 'set_volume', { track: 'music-1', volume: 3 })).toThrow(OpError);
		expect(() => applyOp(t, 'mute_track', { track: 'nope', muted: true })).toThrow(/No audio/);
		t = applyOp(t, 'set_ducking', { enabled: true }).timeline;
		expect(t.ducking).toBe(true);
		t = applyOp(t, 'remove_audio', { track: 'music-1' }).timeline;
		expect(t.audio.map((a) => a.id)).toEqual(['voiceover-1']);
		expect(applyOp(t, 'add_audio', { kind: 'voiceover', key: 'k' }).timeline.audio[1].id).toBe(
			'voiceover-2'
		);
		expect(() => applyOp(t, 'remove_audio', { track: 'original' })).toThrow(/mute it/);
	});

	it('picture: aspect, crop, blur, text', () => {
		expect(run('set_aspect', { aspect: '1:1' }).timeline.aspect).toBe('1:1');
		expect(() => run('set_aspect', { aspect: '4:5' })).toThrow(OpError);
		expect(run('set_crop_offset', { x: 0.2 }).timeline.cropX).toBe(0.2);
		const blur = { start: 1, end: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
		expect(run('blur_region', blur).timeline.blurRegions).toEqual([blur]);
		expect(() => run('blur_region', { ...blur, x: 0.9 })).toThrow(/invalid/);
		const text = run('add_text_overlay', { start: 0, end: 2, text: 'Hi' }).timeline.textOverlays;
		expect(text).toEqual([{ start: 0, end: 2, text: 'Hi', position: 'top' }]);
	});

	it('captions: toggle and style', () => {
		expect(run('toggle_captions', { enabled: false }).timeline.captions.enabled).toBe(false);
		const r = run('set_caption_style', { color: '#FF0000', wordsPerChunk: 2 });
		expect(r.timeline.captions.style).toMatchObject({
			color: '#FF0000',
			wordsPerChunk: 2,
			size: 'medium'
		});
		expect(r.summary).toBe('Changed caption color, wordsPerChunk');
		expect(() => run('set_caption_style', { color: 'red' })).toThrow(OpError);
	});

	it('rejects unknown ops and extra args', () => {
		expect(() => run('explode', {})).toThrow(/Unknown/);
		expect(() => run('set_aspect', { aspect: '1:1', extra: 1 })).toThrow(OpError);
	});

	it('locate maps output time to segment + source time', () => {
		expect(locate(base(), 12)).toEqual({ index: 1, source: 22 });
		expect(locate(base(), 99)).toEqual({ index: 1, source: 25 });
	});
});

describe('history', () => {
	it('undo / redo', () => {
		let h = initHistory(1);
		h = push(h, 2, 'two');
		h = push(h, 3, 'three');
		const u = undo(h)!;
		expect(u.history.present.value).toBe(2);
		expect(u.undone).toBe('three');
		const r = redo(u.history)!;
		expect(r.history.present.value).toBe(3);
		expect(r.redone).toBe('three');
		expect(undo(initHistory(1))).toBeNull();
		expect(redo(h)).toBeNull();
		expect(push(u.history, 9, 'nine').future).toEqual([]);
	});
});
