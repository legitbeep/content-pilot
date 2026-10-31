import { UPLOAD_LIMITS } from '$lib/entities/job';

/** Duration from the browser's own metadata read; null if it can't decode the container. */
export function readDuration(file: File): Promise<number | null> {
	return new Promise((resolve) => {
		const video = document.createElement('video');
		const url = URL.createObjectURL(file);
		const done = (d: number | null) => {
			URL.revokeObjectURL(url);
			resolve(d);
		};
		video.preload = 'metadata';
		video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
		video.onerror = () => done(null);
		video.src = url;
	});
}

/** Client-side checks; the server re-checks size/type and the worker re-checks duration. */
export function checkFile(file: File, duration: number | null): string | null {
	if (!file.type.startsWith('video/')) return 'Only video files can be uploaded.';
	if (file.size > UPLOAD_LIMITS.maxBytes) return 'Videos must be 2 GB or smaller.';
	if (duration !== null && duration > UPLOAD_LIMITS.maxSeconds)
		return 'Videos must be 60 minutes or shorter.';
	return null;
}

/** PUT straight to R2 (XHR for upload progress). */
export function putFile(url: string, file: File, onProgress: (pct: number) => void) {
	return new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('PUT', url);
		xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
		xhr.onload = () =>
			xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`));
		xhr.onerror = () =>
			reject(new Error('Upload failed. Check your connection (or the R2 CORS settings).'));
		xhr.send(file);
	});
}
