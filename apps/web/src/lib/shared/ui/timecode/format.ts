/** 83.42 → "01:23.4"; 3723.5 → "1:02:03.5". Tenths are truncated, not rounded. */
export function formatTimecode(seconds: number): string {
	const tenths = Math.floor(Math.max(0, seconds) * 10);
	const h = Math.floor(tenths / 36000);
	const m = Math.floor((tenths % 36000) / 600);
	const s = Math.floor((tenths % 600) / 10);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${h ? `${h}:` : ''}${pad(m)}:${pad(s)}.${tenths % 10}`;
}
