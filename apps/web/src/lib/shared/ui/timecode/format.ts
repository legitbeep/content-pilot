/** 83.42 → "01:23.4"; 3723.5 → "1:02:03.5". Tenths are truncated, not rounded.
 * `whole`: whole seconds, unpadded minutes: 5 → "0:05", 3725 → "1:02:05". */
export function formatTimecode(seconds: number, { whole = false } = {}): string {
	const tenths = Math.floor(Math.max(0, seconds) * 10);
	const h = Math.floor(tenths / 36000);
	const m = Math.floor((tenths % 36000) / 600);
	const s = Math.floor((tenths % 600) / 10);
	const pad = (n: number) => String(n).padStart(2, '0');
	if (whole) return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
	return `${h ? `${h}:` : ''}${pad(m)}:${pad(s)}.${tenths % 10}`;
}
