# Docs: docs/llm.md
"""Groq Whisper: ffmpeg extracts mono 16 kHz audio, splits it into chunks under Groq's upload limit
with ~2s overlap, asks for word timestamps (verbose_json), offsets each chunk's times and drops the
duplicate words in the overlaps. No speaker labels (speaker = None).
Checked against console.groq.com/docs/speech-to-text on 2026-10-31: 25 MB direct uploads."""

import json
import math
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from worker.llm.errors import AIError
from worker.llm.registry import REGISTRY
from worker.transcript import Transcript, Utterance, Word, _group_by_speaker

from .errors import http_error

CONF = REGISTRY["transcription"]["groq"]
URL = "https://api.groq.com/openai/v1/audio/transcriptions"
BITRATE = 32_000  # mp3, mono 16 kHz: ~4 KB/s, so a 60-min video is ~14 MB
OVERLAP_S = 2.0
MAX_CHUNK_S = 600.0  # smaller requests retry cheaper and stay under free-tier limits


def chunk_plan(
    duration: float, max_bytes: int = CONF["max_file_bytes"]
) -> list[tuple[float, float]]:
    """[(start_s, length_s)] covering [0, duration], consecutive chunks overlapping by OVERLAP_S."""
    size = min(MAX_CHUNK_S, max_bytes * 0.9 / (BITRATE / 8))
    out: list[tuple[float, float]] = []
    start = 0.0
    while True:
        out.append((start, min(size, duration - start)))
        if start + size >= duration:
            return out
        start += size - OVERLAP_S


def stitch(chunks: list[tuple[float, dict]]) -> tuple[list[Word], list[Utterance]]:
    """chunks = [(start_s, verbose_json)]. Each overlap is split at its midpoint: a word belongs to
    the chunk whose half of the overlap its (offset) start falls in, so none is kept twice."""
    words: list[Word] = []
    utterances: list[Utterance] = []
    for i, (start, res) in enumerate(chunks):
        lo = start + OVERLAP_S / 2 if i else -math.inf
        hi = chunks[i + 1][0] + OVERLAP_S / 2 if i + 1 < len(chunks) else math.inf
        for w in res.get("words") or []:
            s = start + w["start"]
            if lo <= s < hi:
                words.append(Word(w=w["word"].strip(), start=s, end=start + w["end"]))
        for seg in res.get("segments") or []:
            s = start + seg["start"]
            if lo <= s < hi and seg.get("text", "").strip():
                text = seg["text"].strip()
                utterances.append(Utterance(start=s, end=start + seg["end"], text=text))
    return words, utterances


def _ffmpeg(*args: str) -> None:
    try:
        subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", *args], check=True,
                       capture_output=True, timeout=1800)  # fmt: skip
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as e:
        detail = getattr(e, "stderr", b"") or repr(e)
        msg = "Couldn't extract the audio for transcription. Retry, or check the details."
        raise AIError("unknown", "groq", detail=str(detail)[:2000], message=msg) from e


def _duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True, capture_output=True, timeout=60,
    )  # fmt: skip
    return float(json.loads(out.stdout)["format"]["duration"])


def _post(api_key: str, audio: Path) -> dict:
    boundary = uuid.uuid4().hex
    fields = [
        ("model", CONF["model"]),
        ("response_format", "verbose_json"),
        ("timestamp_granularities[]", "word"),
        ("timestamp_granularities[]", "segment"),
        ("temperature", "0"),
    ]
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
        for k, v in fields
    ]
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{audio.name}"\r\n'
        "Content-Type: audio/mpeg\r\n\r\n".encode()
        + audio.read_bytes()
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        URL,
        data=b"".join(parts),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise http_error("groq", e.code, body, e.headers.get("retry-after")) from e
    except (urllib.error.URLError, TimeoutError) as e:
        msg = "Couldn't reach Groq. Retry in a minute."
        raise AIError("unknown", "groq", detail=repr(e), message=msg) from e


def transcribe(api_key: str, media_url: str) -> Transcript:
    with tempfile.TemporaryDirectory() as tmp:
        audio = Path(tmp) / "audio.mp3"
        _ffmpeg("-i", media_url, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame",
                "-b:a", str(BITRATE), str(audio))  # fmt: skip
        duration = _duration(audio)
        chunks: list[tuple[float, dict]] = []
        for i, (start, length) in enumerate(chunk_plan(duration)):
            part = Path(tmp) / f"chunk{i}.mp3"
            _ffmpeg("-ss", str(start), "-t", str(length), "-i", str(audio), "-c", "copy", str(part))
            chunks.append((start, _post(api_key, part)))
    words, utterances = stitch(chunks)
    return Transcript(
        provider="groq",
        duration_s=duration,
        words=words,
        utterances=utterances or _group_by_speaker(words),
    )
