# Docs: docs/llm.md
"""Normalised AI errors. Mirror of apps/web/src/lib/server/llm/errors.ts; the shared fixtures
(packages/llm-registry/fixtures/responses.json) check both produce the same messages."""

import re
from typing import Literal

from .registry import provider_name

ErrorKind = Literal[
    "missing_key",
    "invalid_key",
    "rate_limited",
    "overloaded",
    "context_too_long",
    "content_blocked",
    "unknown",
]

# Sent on every outbound worker HTTP call: Cloudflare (in front of Groq) 403s urllib's default UA.
USER_AGENT = "clip-studio-worker/1.0"
# Cloudflare edge block ("error code: 1010" etc.): not the key's fault.
CLOUDFLARE_BLOCK = re.compile(r"error code: 10\d\d")

MISSING_KEY_MESSAGE = "Add an AI provider key in Settings to use this."


def message_for(kind: str, name: str = "", retry_after: int | None = None) -> str:
    if kind == "missing_key":
        return MISSING_KEY_MESSAGE
    if kind == "invalid_key":
        return f"Your {name} key was rejected. Update it in Settings."
    if kind == "rate_limited":
        wait = f"{retry_after}s" if retry_after else "a minute"
        return (
            f"Your {name} key hit its rate limit. Try again in {wait} "
            "or switch provider in Settings."
        )
    if kind == "overloaded":
        return (
            f"{name} is overloaded right now. Try again in a minute or switch provider in Settings."
        )
    if kind == "context_too_long":
        return f"This is too long for {name}. Try a shorter input or switch provider in Settings."
    if kind == "content_blocked":
        return f"{name} refused this content. Try different wording or switch provider in Settings."
    return f"{name} returned an error. Try again or switch provider in Settings."


class AIError(Exception):
    def __init__(
        self,
        kind: str,
        provider: str | None = None,
        retry_after: int | None = None,
        detail: str = "",
        message: str | None = None,
    ):
        self.kind = kind
        self.provider = provider
        self.retry_after = retry_after
        self.detail = detail  # technical (provider response), never the main message
        self.message = message or message_for(kind, provider_name(provider or ""), retry_after)
        super().__init__(self.message)
