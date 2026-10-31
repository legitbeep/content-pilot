# Docs: docs/llm.md
"""The ONE transcription interface: transcribe(user_id, media_url) -> Transcript (our format,
worker/transcript.py). Provider = the user's choice among saved keys (deepgram | groq), or the
demo Groq key for allowlisted users (ADR 0008); none -> AIError("missing_key").
Gemini is not used: its word timestamps aren't reliable enough for cutting clips (docs/llm.md)."""

from worker import keys as user_keys
from worker.llm.errors import AIError
from worker.llm.keys import key_for, load_user_ai, resolve_transcription
from worker.transcript import Transcript

from . import deepgram, groq

__all__ = ["AIError", "transcribe"]


def transcribe(user_id: str, media_url: str) -> Transcript:
    r = resolve_transcription(load_user_ai(user_id))
    if not r:
        raise AIError("missing_key")
    key = key_for(user_id, r)
    provider = deepgram if r["provider"] == "deepgram" else groq
    try:
        transcript = provider.transcribe(key, media_url)
    except AIError as e:
        if e.kind == "invalid_key" and r["source"] == "user":
            user_keys.mark_invalid(user_id, r["provider"])
        raise
    if r["source"] == "user":
        user_keys.mark_valid(user_id, r["provider"])
    return transcript
