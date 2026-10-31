# Docs: docs/pipeline.md
"""Transcript helpers shared by the AI steps: load our transcript, split it into sentences (the
units clips snap to) and chunk numbered sentence lines to a provider's input budget."""

import json
from dataclasses import dataclass

from worker import r2
from worker.transcript import Transcript

MAX_SENTENCE_WORDS = 40
PAUSE_S = 1.0


@dataclass
class Sentence:
    i: int
    start: float
    end: float
    text: str


def load(job: dict) -> Transcript:
    return Transcript.model_validate(json.loads(r2.get_bytes(job["transcript_path"])))


def sentences(t: Transcript) -> list[Sentence]:
    """Split words at sentence punctuation, an utterance/segment end (Groq words carry no
    punctuation), a pause, or a length cap. Speaker labels are ignored (may be None)."""
    ends = {round(u.end, 2) for u in t.utterances}
    out: list[Sentence] = []
    cur: list = []
    for k, w in enumerate(t.words):
        cur.append(w)
        nxt = t.words[k + 1] if k + 1 < len(t.words) else None
        if (
            nxt is None
            or w.w.rstrip("\"')").endswith((".", "?", "!"))
            or round(w.end, 2) in ends
            or nxt.start - w.end > PAUSE_S
            or len(cur) >= MAX_SENTENCE_WORDS
        ):
            text = " ".join(x.w for x in cur).strip()
            out.append(Sentence(len(out), cur[0].start, cur[-1].end, text))
            cur = []
    return out


def mmss(s: float) -> str:
    return f"{int(s // 60):02d}:{s % 60:04.1f}"


def line(s: Sentence) -> str:
    return f"[{s.i}] {mmss(s.start)} {s.text}"


def tokens(text: str) -> int:
    # ponytail: ~4 chars per token (same estimate as the web's memory.ts); real tokenizer if needed.
    return len(text) // 4 + 1


def chunk(lines: list[str], budget: int) -> list[str]:
    """Join lines into blocks of at most `budget` estimated tokens (never splits a line)."""
    blocks: list[str] = []
    cur: list[str] = []
    used = 0
    for ln in lines:
        n = tokens(ln) + 1
        if cur and used + n > budget:
            blocks.append("\n".join(cur))
            cur, used = [], 0
        cur.append(ln)
        used += n
    if cur:
        blocks.append("\n".join(cur))
    return blocks


def budget(max_input: int, reserved: int = 2000) -> int:
    """Room left for transcript text after the system prompt, memory and schema."""
    return max(1000, max_input - reserved)
