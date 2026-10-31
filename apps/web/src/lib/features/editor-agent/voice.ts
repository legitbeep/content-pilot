// Browser voice recording for the agent: mic → 16 kHz mono 16-bit WAV (what Wispr Flow expects;
// Groq accepts it too) → POST /api/editor/voice → text. docs/agent.md

const RATE = 16000;

/** PCM16 WAV bytes from mono float samples. */
export function encodeWav(samples: Float32Array, rate = RATE): Uint8Array {
	const buf = new ArrayBuffer(44 + samples.length * 2);
	const v = new DataView(buf);
	const str = (o: number, s: string) =>
		[...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
	str(0, 'RIFF');
	v.setUint32(4, 36 + samples.length * 2, true);
	str(8, 'WAVE');
	str(12, 'fmt ');
	v.setUint32(16, 16, true);
	v.setUint16(20, 1, true); // PCM
	v.setUint16(22, 1, true); // mono
	v.setUint32(24, rate, true);
	v.setUint32(28, rate * 2, true);
	v.setUint16(32, 2, true);
	v.setUint16(34, 16, true);
	str(36, 'data');
	v.setUint32(40, samples.length * 2, true);
	samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
	return new Uint8Array(buf);
}

/** Start recording; the returned function stops it and resolves to the transcript. */
export async function startRecording(): Promise<() => Promise<string>> {
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	const rec = new MediaRecorder(stream);
	const chunks: Blob[] = [];
	rec.ondataavailable = (e) => chunks.push(e.data);
	rec.start();
	return async () => {
		await new Promise<void>((ok) => {
			rec.onstop = () => ok();
			rec.stop();
		});
		stream.getTracks().forEach((t) => t.stop());
		const decoded = await new AudioContext().decodeAudioData(await new Blob(chunks).arrayBuffer());
		const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
		const src = off.createBufferSource();
		src.buffer = decoded;
		src.connect(off.destination);
		src.start();
		const mono = (await off.startRendering()).getChannelData(0);
		const res = await fetch('/api/editor/voice', {
			method: 'POST',
			headers: { 'content-type': 'audio/wav' },
			body: encodeWav(mono) as BlobPart
		});
		if (!res.ok)
			throw new Error(
				((await res.json().catch(() => null)) as { message?: string } | null)?.message ??
					'Voice input failed. Type instead.'
			);
		return ((await res.json()) as { text: string }).text;
	};
}
