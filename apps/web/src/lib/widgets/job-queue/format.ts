const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "5 minutes ago", "yesterday" … */
export function timeAgo(iso: string, now = Date.now()): string {
	const s = (new Date(iso).getTime() - now) / 1000;
	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		['day', 86400],
		['hour', 3600],
		['minute', 60]
	];
	for (const [unit, size] of units)
		if (Math.abs(s) >= size) return rtf.format(Math.round(s / size), unit);
	return 'just now';
}

/** Transcript as 5-second paragraphs: every utterance starting in [n·size, (n+1)·size) is joined
 * into one. Expects utterances in start order; empty buckets don't appear. */
export function groupTranscript(utterances: { start: number; text: string }[], size = 5) {
	const out: { start: number; text: string }[] = [];
	for (const u of utterances) {
		const text = u.text.trim();
		if (!text) continue;
		const start = Math.floor(u.start / size) * size;
		const last = out.at(-1);
		if (last?.start === start) last.text += ` ${text}`;
		else out.push({ start, text });
	}
	return out;
}
