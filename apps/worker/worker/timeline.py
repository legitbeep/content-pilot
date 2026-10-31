# Docs: docs/timeline.md
"""Pydantic mirror of packages/timeline-schema/timeline.schema.json (keep in sync with zod)."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Seconds = Field(ge=0)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Range(_Strict):
    start: float = Seconds
    end: float = Seconds

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.end <= self.start:
            raise ValueError("end must be greater than start")
        return self


class Caption(Range):
    text: str = Field(min_length=1)


class TextOverlay(Range):
    text: str = Field(min_length=1)
    position: Literal["top", "center", "bottom"]


class Timeline(_Strict):
    version: Literal[1]
    sourceKey: str = Field(min_length=1)  # noqa: N815 - JSON field name
    aspect: Literal["9:16", "1:1", "16:9"]
    segments: list[Range] = Field(min_length=1)
    captions: list[Caption]
    textOverlays: list[TextOverlay]  # noqa: N815
