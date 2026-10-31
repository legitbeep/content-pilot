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
