# Docs: docs/pipeline.md
"""Find clip candidates and cut them. Transcript sentences in ~5-minute windows (30s overlap) →
LLM task `extract_clips` (sentence-index ranges, so cuts snap to sentence boundaries, plus hook,
topic, hook type, reasons, scores) → merge overlaps → ranking.apply_weights → top N.
Per clip: re-encoded cut with 5s handles (clips/<id>/source.mp4), thumbnail
(clips/<id>/thumb.jpg), word slice relative to the file, features, v2 timeline.
Re-running replaces this job's unselected candidates (idempotent)."""

import re
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

import ranking
from worker import db, r2
from worker.llm import generate_json
from worker.timeline import Timeline

from . import text

WINDOW_S = 300
OVERLAP_S = 30
HANDLE_S = 5
MIN_S, MAX_S = 15, 60
DEFAULT_N, MAX_N = 8, 15
NS = uuid.UUID("5c1f0000-0000-4000-8000-00000000c11b")
HookType = Literal["question", "contrarian", "story", "tip", "reaction"]


class Scores(BaseModel):
    hook_strength: float = Field(ge=0, le=1)
    standalone: float = Field(ge=0, le=1)
    brand_fit: float = Field(ge=0, le=1)
    request_match: float = Field(ge=0, le=1)


class Candidate(BaseModel):
    start_sentence: int
    end_sentence: int
    hook: str
    topic: str
    hook_type: HookType
    reasons: list[str] = Field(min_length=1)
    scores: Scores
    description: str


class Extraction(BaseModel):
    clips: list[Candidate]


SYSTEM = f"""You pick the best short clips (for YouTube Shorts / Reels / TikTok) from part of a creator's long video.
Transcript lines look like "[index] mm:ss text"; speakers are not labelled.
Return up to 5 moments that work on their own, each {MIN_S}-{MAX_S} seconds long:
- start_sentence / end_sentence: line indexes (inclusive) where the clip starts and ends. Start on a strong first line.
- hook: the opening line that grabs attention (quote or tighten it). topic: 1-3 words.
- hook_type: question | contrarian | story | tip | reaction.
- reasons: 2-4 short reasons it is a good clip. When relevant, cite the brand memory, the creator's request or their intent for this video, e.g. "Matches your core topic: hygiene" or "Contrasts with your vegan stance, as you asked".
- scores 0-1: hook_strength, standalone (makes sense without context), brand_fit, request_match (1 if there is no request).
- description: 1-2 sentences on what happens in the clip.
Follow the creator's intent for this video when given. Skip intros, outros, ads and filler. Return {{"clips": []}} if nothing is good.
Return JSON: {{"clips": [{{"start_sentence": 0, "end_sentence": 4, "hook": "...", "topic": "...", "hook_type": "tip", "reasons": ["..."], "scores": {{"hook_strength": 0.8, "standalone": 0.9, "brand_fit": 0.7, "request_match": 1}}, "description": "..."}}]}}"""  # noqa: E501


def windows(sents: list[text.Sentence]) -> list[list[text.Sentence]]:
    if not sents:
        return []
    out, t, last = [], 0.0, sents[-1].end
    while True:
        w = [s for s in sents if t <= s.start < t + WINDOW_S]
        if w:
            out.append(w)
        if t + WINDOW_S >= last:
            return out
        t += WINDOW_S - OVERLAP_S


def snap(c: Candidate, sents: list[text.Sentence]) -> dict | None:
    """Candidate → source-time range on sentence boundaries, nudged into MIN_S..MAX_S."""
    s, e = c.start_sentence, c.end_sentence
    if not (0 <= s <= e < len(sents)):
        return None
    length = lambda: sents[e].end - sents[s].start  # noqa: E731
    while length() < MIN_S and e + 1 < len(sents) and sents[e + 1].end - sents[s].start <= MAX_S:
        e += 1
    while length() > MAX_S and e > s:
        e -= 1
    if length() > MAX_S or length() < 5:
        return None
    return {
        "start_s": round(sents[s].start, 3),
        "end_s": round(sents[e].end, 3),
        "hook": c.hook.strip(),
        "reasons": [r.strip() for r in c.reasons if r.strip()][:4],
        "scores": c.scores.model_dump(),
        "features": features(c.topic, length(), c.hook_type),
        "description": c.description.strip(),
    }


def features(topic: str, length: float, hook_type: str) -> dict:
    bucket = "short" if length <= 30 else "medium" if length <= 60 else "long"
    return {"topic": topic.strip().lower(), "length_bucket": bucket, "hook_type": hook_type}


def merge(cands: list[dict]) -> list[dict]:
    """Drop a candidate that overlaps a better one by more than half of the shorter clip."""
    kept: list[dict] = []
    for c in sorted(cands, key=lambda c: -sum(c["scores"].values())):
        if all(
            min(c["end_s"], k["end_s"]) - max(c["start_s"], k["start_s"])
            <= 0.5 * min(c["end_s"] - c["start_s"], k["end_s"] - k["start_s"])
            for k in kept
        ):
            kept.append(c)
    return kept


def wanted(request: str | None) -> int:
    m = re.search(r"\b(\d{1,2})\s+(?:short\s+)?clips?\b", request or "", re.I)
    return min(int(m.group(1)), MAX_N) if m and int(m.group(1)) > 0 else DEFAULT_N


def candidates(job: dict, sents: list[text.Sentence]) -> list[dict]:
    context = "\n\n".join(
        x
        for x in [
            f"Brand memory:\n{job['memory_snapshot']}" if job.get("memory_snapshot") else "",
            f"Creator's request: {job['request']}" if job.get("request") else "",
            f"Creator's intent for this video: {job['user_intent']}"
            if job.get("user_intent")
            else "",
        ]
        if x
    )
    out: list[dict] = []
    # ponytail: a 5-minute window (~1k tokens) fits every provider's budget, so no extra chunking.
    for w in windows(sents):
        data: Extraction = generate_json(
            user_id=job["user_id"],
            task="extract_clips",
            schema=Extraction,
            system=SYSTEM,
            prompt=f"{context}\n\nTranscript:\n" + "\n".join(text.line(s) for s in w),
        )["data"]
        out += [c for c in (snap(x, sents) for x in data.clips) if c]
    return out


def word_slice(words: list, start: float, end: float) -> list[dict]:
    return [
        {"w": w.w, "start": round(w.start - start, 3), "end": round(w.end - start, 3)}
        for w in words
        if w.start >= start and w.end <= end
    ]


def timeline(key: str, start: float, end: float) -> dict:
    return Timeline.model_validate(
        {
            "version": 2,
            "sourceKey": key,
            "aspect": "9:16",
            "cropX": 0.5,
            "segments": [{"start": start, "end": end}],
            "originalAudio": {"muted": False, "volume": 1},
            "audio": [],
            "ducking": False,
            "captions": {
                "enabled": True,
                "style": {
                    "font": "Hanken Grotesk",
                    "color": "#FFFFFF",
                    "position": "bottom",
                    "size": "medium",
                    "wordsPerChunk": 3,
                },
            },
            "textOverlays": [],
            "blurRegions": [],
        }
    ).model_dump(exclude_none=True)


def ffmpeg(*args: str) -> None:
    out = subprocess.run(["ffmpeg", "-y", "-v", "error", *args], capture_output=True, text=True)
    if out.returncode:
        raise RuntimeError(f"ffmpeg failed: {out.stderr[-2000:]}")


def cut(source_url: str, start: float, length: float, offset: float, video: str, thumb: str):
    """Accurate re-encoded cut (stream copy snaps to keyframes and would skew word times)."""
    ffmpeg(
        "-ss", str(start), "-i", source_url, "-t", str(length),
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-movflags", "+faststart", video,
    )  # fmt: skip
    ffmpeg("-ss", str(offset), "-i", video, "-frames:v", "1", "-vf", "scale=-2:480", thumb)


def clear_candidates(job: dict) -> None:
    with db.connect() as c:
        rows = c.execute(
            "delete from clips where job_id = %s and user_id = %s and not selected "
            "returning file_key, thumb_key",
            (job["id"], job["user_id"]),
        ).fetchall()
    for r in rows:
        for key in (r["file_key"], r["thumb_key"]):
            if key:
                r2.delete(key)


def run(job: dict) -> None:
    t = text.load(job)
    sents = text.sentences(t)
    duration = float((job.get("media") or {}).get("duration_s") or t.duration_s)
    picked = ranking.apply_weights(job["user_id"], merge(candidates(job, sents)))
    picked = picked[: wanted(job.get("request"))]
    clear_candidates(job)
    source_url = r2.presigned_get(job["source_key"])
    with tempfile.TemporaryDirectory() as tmp:
        for c in picked:
            save(job, c, duration, source_url, t.words, Path(tmp))


def save(job: dict, c: dict, duration: float, source_url: str, words: list, tmp: Path) -> None:
    clip_id = str(uuid.uuid5(NS, f"{job['id']}:{c['start_s']}:{c['end_s']}"))
    fs = max(0.0, c["start_s"] - HANDLE_S)
    fe = min(duration, c["end_s"] + HANDLE_S)
    key, thumb_key = f"clips/{clip_id}/source.mp4", f"clips/{clip_id}/thumb.jpg"
    video, thumb = str(tmp / f"{clip_id}.mp4"), str(tmp / f"{clip_id}.jpg")
    cut(source_url, fs, fe - fs, c["start_s"] - fs + 0.5, video, thumb)
    r2.upload_file(video, key, "video/mp4")
    r2.upload_file(thumb, thumb_key, "image/jpeg")
    with db.connect() as conn:
        row = conn.execute(
            """insert into clips (id, user_id, job_id, start_s, end_s, reason, reasons, score,
                 ranking_score, hook, description, scores, features, file_key, thumb_key,
                 file_start_s, file_end_s, words)
               values (%(id)s, %(user_id)s, %(job_id)s, %(start_s)s, %(end_s)s, %(reason)s,
                 %(reasons)s, %(rs)s, %(rs)s, %(hook)s, %(description)s, %(scores)s,
                 %(features)s, %(key)s, %(thumb)s, %(fs)s, %(fe)s, %(words)s)
               on conflict (job_id, start_s, end_s) do update set reason = excluded.reason,
                 reasons = excluded.reasons, score = excluded.score,
                 ranking_score = excluded.ranking_score, hook = excluded.hook,
                 description = excluded.description, scores = excluded.scores,
                 features = excluded.features, file_key = excluded.file_key,
                 thumb_key = excluded.thumb_key, words = excluded.words
               returning id""",
            {
                "id": clip_id, "user_id": job["user_id"], "job_id": job["id"],
                "start_s": c["start_s"], "end_s": c["end_s"],
                "reason": c["reasons"][0] if c["reasons"] else c["hook"],
                "reasons": db.Jsonb(c["reasons"]), "rs": c["ranking_score"], "hook": c["hook"],
                "description": c["description"], "scores": db.Jsonb(c["scores"]),
                "features": db.Jsonb(c["features"]), "key": key, "thumb": thumb_key,
                "fs": fs, "fe": fe, "words": db.Jsonb(word_slice(words, fs, fe)),
            },
        ).fetchone()  # fmt: skip
        assert row
        conn.execute(
            """insert into timelines (user_id, clip_id, data) values (%s, %s, %s)
               on conflict (clip_id) do nothing""",
            (
                job["user_id"],
                row["id"],
                db.Jsonb(timeline(key, round(c["start_s"] - fs, 3), round(c["end_s"] - fs, 3))),
            ),
        )
