# Docs: docs/pipeline.md
"""Our transcript format. Everything after `transcribe` reads this, never a provider's shape.
speaker is None when the provider has no speaker labels (Groq Whisper)."""

from pydantic import BaseModel


class Word(BaseModel):
    w: str
    start: float  # source seconds
    end: float
    speaker: int | None = None


class Utterance(BaseModel):
    speaker: int | None = None
    start: float
    end: float
    text: str


class Transcript(BaseModel):
    provider: str
    duration_s: float
    words: list[Word]
    utterances: list[Utterance]


def _group_by_speaker(words: list[Word]) -> list[Utterance]:
    out: list[Utterance] = []
    for w in words:
        if out and out[-1].speaker == w.speaker:
            out[-1].end = w.end
            out[-1].text += " " + w.w
        else:
            out.append(Utterance(speaker=w.speaker, start=w.start, end=w.end, text=w.w))
    return out


def from_deepgram(raw: dict) -> Transcript:
    """Deepgram pre-recorded response (nova-3, smart_format, diarize_model, utterances)."""
    results = raw.get("results", {})
    channels = results.get("channels") or [{}]
    alt = (channels[0].get("alternatives") or [{}])[0]
    words = [
        Word(
            w=d.get("punctuated_word") or d["word"],
            start=d["start"],
            end=d["end"],
            speaker=d.get("speaker", 0),
        )
        for d in alt.get("words", [])
    ]
    utterances = [
        Utterance(speaker=u.get("speaker", 0), start=u["start"], end=u["end"], text=u["transcript"])
        for u in results.get("utterances") or []
    ] or _group_by_speaker(words)
    duration = raw.get("metadata", {}).get("duration") or (words[-1].end if words else 0.0)
    return Transcript(provider="deepgram", duration_s=duration, words=words, utterances=utterances)
