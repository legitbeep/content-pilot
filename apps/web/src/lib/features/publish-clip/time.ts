/** `<input type="datetime-local">` value (user's time zone) → UTC ISO string. */
export const toUtcIso = (local: string) => (local ? new Date(local).toISOString() : '');

/** Date → `datetime-local` value in the user's time zone. */
export function toLocalInput(d: Date): string {
	const off = d.getTimezoneOffset() * 60_000;
	return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
