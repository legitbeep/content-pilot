# Docs: docs/pipeline.md
"""Content safety. Frames: 1 per second (ffmpeg over a presigned GET) scored by a small open
NSFW image model on CPU (onnxruntime). Text: LLM task `moderate_text` per transcript chunk.
Clearly explicit -> failed (no override) and the source is deleted at once.
Borderline -> NeedsInput with the flagged time ranges, options Continue / Cancel.
Editor uploads (voiceover, music, extra video) go through `check_upload` before every render
(loops/render.py): explicit -> the upload is deleted and the render fails; the verdict is cached
in R2 at safety/<key>.json so each file is checked once.

Model: Falconsai/nsfw_image_detection (ViT, Apache-2.0), ONNX int8 port
onnx-community/nsfw_image_detection-ONNX, baked into the Docker image (Dockerfile)."""

import os
import subprocess
from datetime import UTC, datetime
from functools import cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from worker import db, r2
from worker.llm import generate_json, max_input_tokens
from worker.transcription import transcribe

from . import text
from .errors import NeedsInput, StepError

EXPLICIT_P = 0.9  # a frame this sure is explicit
BORDER_P = 0.6  # a frame this sure is worth asking about
EXPLICIT_MIN_FRAMES = 3  # and at least this many (or EXPLICIT_SHARE of all frames)
EXPLICIT_SHARE = 0.05
SIZE = 224
BATCH = 16
EXPLICIT_MESSAGE = "This video contains explicit content and can't be processed."
DEFAULT_MODEL = Path(__file__).resolve().parents[1] / "models" / "nsfw.onnx"


class Flag(BaseModel):
    sentence: int
    why: str


class Moderation(BaseModel):
    verdict: Literal["clean", "borderline", "explicit"]
    flags: list[Flag] = []


SYSTEM = """You review a video transcript before short clips are cut from it for social media.
Lines look like "[index] mm:ss text".
- explicit: graphic sexual content or sexual content involving minors, or content whose main purpose is graphic gore.
- borderline: sexual innuendo, heavy profanity or slurs, graphic descriptions of violence, self-harm, or drug use.
- clean: everything else, including mature topics discussed in a factual or educational way.
Flag the sentences behind a borderline or explicit verdict (index + a short reason, max 10).
Return JSON: {"verdict": "clean|borderline|explicit", "flags": [{"sentence": 0, "why": "..."}]}"""  # noqa: E501


def decide(
    frame_scores: list[float], text_verdicts: list[str]
) -> Literal["pass", "borderline", "explicit"]:
    """Pure decision from per-second NSFW probabilities and per-chunk text verdicts."""
    sure = sum(p >= EXPLICIT_P for p in frame_scores)
    if "explicit" in text_verdicts or (
        sure >= EXPLICIT_MIN_FRAMES and sure >= EXPLICIT_SHARE * len(frame_scores)
    ):
        return "explicit"
    if "borderline" in text_verdicts or any(p >= BORDER_P for p in frame_scores):
        return "borderline"
    return "pass"


def flagged_ranges(frame_scores: list[float], gap: int = 2) -> list[dict]:
    """Seconds with p >= BORDER_P merged into ranges (frame i = second i)."""
    out: list[dict] = []
    for i, p in enumerate(frame_scores):
        if p < BORDER_P:
            continue
        if out and i - out[-1]["end"] <= gap:
            out[-1]["end"] = i + 1
            out[-1]["peak"] = max(out[-1]["peak"], p)
        else:
            out.append({"start": i, "end": i + 1, "peak": p})
    return [
        {"start": r["start"], "end": r["end"], "why": f"Image check ({round(r['peak'] * 100)}%)"}
        for r in out
    ]


@cache
def _session():
    import onnxruntime as ort  # lazy: heavy import, unused by most tests

    path = os.environ.get("NSFW_MODEL_PATH") or str(DEFAULT_MODEL)
    if not os.path.exists(path):
        raise StepError(
            "The content safety check isn't set up on this worker.",
            f"NSFW model missing at {path} (Dockerfile bakes it; locally: pnpm nsfw:model)",
        )
    return ort.InferenceSession(path, providers=["CPUExecutionProvider"])


def _classify(frames: bytes, n: int) -> list[float]:
    import numpy as np

    x = np.frombuffer(frames, dtype=np.uint8).reshape(n, SIZE, SIZE, 3).astype(np.float32)
    x = ((x / 255.0 - 0.5) / 0.5).transpose(0, 3, 1, 2)  # ViTImageProcessor: mean = std = 0.5
    s = _session()
    logits = np.asarray(s.run(None, {s.get_inputs()[0].name: x})[0])
    e = np.exp(logits - logits.max(axis=1, keepdims=True))
    return (e[:, 1] / e.sum(axis=1)).tolist()  # label 1 = nsfw


def frame_scores(url: str) -> list[float]:
    """NSFW probability per second of video, streamed (never the whole video in memory)."""
    # ponytail: 1 fps on CPU is ~minutes for a 60-min video; sample sparser if that hurts.
    _session()  # fail before starting ffmpeg if the model is missing
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", url, "-vf", f"fps=1,scale={SIZE}:{SIZE}",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )  # fmt: skip
    assert proc.stdout and proc.stderr
    frame = SIZE * SIZE * 3
    scores: list[float] = []
    while chunk := proc.stdout.read(frame * BATCH):
        n = len(chunk) // frame
        if n:
            scores += _classify(chunk[: n * frame], n)
    err = proc.stderr.read().decode(errors="replace")
    if proc.wait() != 0:
        raise StepError("We couldn't read this video file. It may be corrupt.", err[-2000:])
    return scores


def moderate(job: dict) -> tuple[list[str], list[dict]]:
    """LLM verdict per transcript chunk + flagged sentence time ranges."""
    return moderate_sentences(job["user_id"], text.sentences(text.load(job)))


def moderate_sentences(user_id: str, sents: list[text.Sentence]) -> tuple[list[str], list[dict]]:
    budget = text.budget(max_input_tokens(user_id, "moderate_text"))
    verdicts: list[str] = []
    flagged: list[dict] = []
    for block in text.chunk([text.line(s) for s in sents], budget):
        m: Moderation = generate_json(
            user_id=user_id, task="moderate_text", schema=Moderation,
            system=SYSTEM, prompt=f"Transcript:\n{block}",
        )["data"]  # fmt: skip
        verdicts.append(m.verdict)
        flagged += [
            {"start": sents[f.sentence].start, "end": sents[f.sentence].end, "why": f.why}
            for f in m.flags
            if 0 <= f.sentence < len(sents)
        ]
    return verdicts, flagged


def run(job: dict) -> None:
    scores = frame_scores(r2.presigned_get(job["source_key"]))
    verdicts, text_flags = moderate(job)
    verdict = decide(scores, verdicts)
    if verdict == "pass":
        return
    if verdict == "explicit":
        r2.delete(job["source_key"])
        db.update_job(job["id"], source_deleted_at=datetime.now(UTC))
        sure = sum(p >= EXPLICIT_P for p in scores)
        raise StepError(EXPLICIT_MESSAGE, f"text: {verdicts}; frames >= {EXPLICIT_P}: {sure}")
    flagged = sorted(flagged_ranges(scores) + text_flags, key=lambda f: f["start"])
    raise NeedsInput(
        {
            "kind": "nsfw",
            "question": "Parts of this video may not be safe for every platform. "
            "Do you want to continue making clips?",
            "options": ["Continue", "Cancel"],
            "allow_text": False,
            "flagged": flagged[:20],
        },
        "brand_fit",
    )


def safety_key(key: str) -> str:
    """Where an upload's verdict is cached. Outside uploads/, so the browser can't write it."""
    return f"safety/{key}.json"


def check_upload(user_id: str, key: str, kind: Literal["audio", "video"]) -> str:
    """Editor upload check: video -> image model on 1 fps frames; audio -> transcript through
    moderate_text (user's keys). Returns decide()'s verdict; explicit deletes the upload.
    Borderline is allowed (the user added the file themselves; the ingest path asks instead)."""
    # ponytail: video uploads skip the speech check (frames only); add transcript moderation
    # if extra clips with explicit speech become a problem.
    marker = safety_key(key)
    if r2.exists(marker):
        return "pass"
    url = r2.presigned_get(key)
    if kind == "video":
        verdict = decide(frame_scores(url), [])
    else:
        verdicts, _ = moderate_sentences(user_id, text.sentences(transcribe(user_id, url)))
        verdict = decide([], verdicts)
    if verdict == "explicit":
        r2.delete(key)
    else:
        r2.put_json(marker, {"verdict": verdict, "checked_at": datetime.now(UTC).isoformat()})
    return verdict
