// Docs: docs/queue.md
// Cloudflare R2 via its S3 API. Browsers upload straight to R2 with a presigned PUT; video bytes
// never pass through SvelteKit.
import { AwsClient } from 'aws4fetch';
import { env } from '$env/dynamic/private';

let client: AwsClient | undefined;

function r2() {
	if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET)
		throw new Error('R2_* env vars are not set (apps/web/.env)');
	client ??= new AwsClient({
		accessKeyId: env.R2_ACCESS_KEY_ID,
		secretAccessKey: env.R2_SECRET_ACCESS_KEY,
		service: 's3',
		region: 'auto'
	});
	return client;
}

const objectUrl = (key: string) =>
	`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key
		.split('/')
		.map(encodeURIComponent)
		.join('/')}`;

/** Presigned PUT URL, valid for `expires` seconds. */
export async function presignPut(key: string, expires = 3600): Promise<string> {
	const url = new URL(objectUrl(key));
	url.searchParams.set('X-Amz-Expires', String(expires));
	const signed = await r2().sign(new Request(url, { method: 'PUT' }), {
		aws: { signQuery: true }
	});
	return signed.url;
}

/** Presigned GET URL (editor preview, rendered clips), valid for `expires` seconds. */
export async function presignGet(key: string, expires = 6 * 3600): Promise<string> {
	const url = new URL(objectUrl(key));
	url.searchParams.set('X-Amz-Expires', String(expires));
	const signed = await r2().sign(new Request(url), { aws: { signQuery: true } });
	return signed.url;
}

/** Object size in bytes, or null if it doesn't exist. */
export async function headSize(key: string): Promise<number | null> {
	const res = await r2().fetch(objectUrl(key), { method: 'HEAD' });
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`R2 HEAD ${key}: ${res.status}`);
	return Number(res.headers.get('content-length') ?? 0);
}

export async function getJson<T>(key: string): Promise<T | null> {
	const res = await r2().fetch(objectUrl(key));
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`R2 GET ${key}: ${res.status}`);
	return res.json() as Promise<T>;
}

/** Missing objects count as deleted. */
export async function deleteObject(key: string): Promise<void> {
	const res = await r2().fetch(objectUrl(key), { method: 'DELETE' });
	if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${key}: ${res.status}`);
}
