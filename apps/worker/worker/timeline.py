# Docs: docs/timeline.md
"""Pydantic mirror of packages/timeline-schema/timeline.schema.json (keep in sync with zod)."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Seconds = Field(ge=0)
Position = Literal["top", "center", "bottom"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class _Range(_Strict):
    start: float = Seconds
    end: float = Seconds

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.end <= self.start:
            raise ValueError("end must be greater than start")
        return self


class Segment(_Range):
    sourceKey: str | None = Field(default=None, min_length=1)  # noqa: N815 - JSON field name


class OriginalAudio(_Strict):
    muted: bool
    volume: float = Field(ge=0, le=2)


class AudioTrack(_Strict):
    id: str = Field(min_length=1)
    kind: Literal["voiceover", "music"]
    key: str = Field(min_length=1)
    start: float = Seconds
    volume: float = Field(ge=0, le=2)
    muted: bool


class CaptionStyle(_Strict):
    font: str = Field(min_length=1)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    position: Position
    size: Literal["small", "medium", "large"]
    wordsPerChunk: int = Field(ge=1, le=5)  # noqa: N815


class Captions(_Strict):
    enabled: bool
    style: CaptionStyle


class TextOverlay(_Range):
    text: str = Field(min_length=1)
    position: Position


class BlurRegion(_Range):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def _fits(self) -> Self:
        if self.x + self.w > 1 or self.y + self.h > 1:
            raise ValueError("region must fit in the frame")
        return self


class Timeline(_Strict):
    version: Literal[2]
    sourceKey: str = Field(min_length=1)  # noqa: N815 - JSON field name
    aspect: Literal["9:16", "1:1", "16:9"]
    cropX: float = Field(ge=0, le=1)  # noqa: N815
    segments: list[Segment] = Field(min_length=1)
    originalAudio: OriginalAudio  # noqa: N815
    audio: list[AudioTrack]
    ducking: bool
    captions: Captions
    textOverlays: list[TextOverlay]  # noqa: N815
    blurRegions: list[BlurRegion]  # noqa: N815

    def segment_key(self, s: Segment) -> str:
        return s.sourceKey or self.sourceKey

    @property
    def duration(self) -> float:
        return sum(s.end - s.start for s in self.segments)


def caption_chunks(t: Timeline, words_by_key: dict[str, list[dict]]) -> list[dict]:
    """Mirror of captionChunks in packages/timeline-schema/src/index.ts (same fixture tests)."""
    chunks: list[dict] = []
    n = t.captions.style.wordsPerChunk
    offset = 0.0
    for seg in t.segments:
        words = [
            w
            for w in words_by_key.get(t.segment_key(seg), [])
            if seg.start <= (w["start"] + w["end"]) / 2 < seg.end
        ]
        for i in range(0, len(words), n):
            group = words[i : i + n]
            chunks.append(
                {
                    "start": round(max(group[0]["start"], seg.start) - seg.start + offset, 3),
                    "end": round(min(group[-1]["end"], seg.end) - seg.start + offset, 3),
                    "text": " ".join(w["w"] for w in group),
                }
            )
        offset += seg.end - seg.start
    return chunks
