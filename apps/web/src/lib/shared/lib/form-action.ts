import { deserialize } from '$app/forms';

/** POST to a form action on the current page and return its data, or throw its `message`. */
export async function formAction<T = unknown>(
	name: string,
	fields: Record<string, string | number | string[]>
): Promise<T> {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields))
		for (const item of Array.isArray(v) ? v : [v]) body.append(k, String(item));
	const res = await fetch(`?/${name}`, { method: 'POST', body });
	const result = deserialize(await res.text());
	if (result.type === 'success') return result.data as T;
	if (result.type === 'failure') throw new Error(String(result.data?.message ?? 'Request failed.'));
	// Thrown `error(409, msg)` (e.g. requireAIKeys) arrives as type 'error' with a readable message.
	if (result.type === 'error' && result.error?.message)
		throw new Error(String(result.error.message));
	throw new Error('Request failed.');
}
