# Docs: docs/llm.md
"""Deepgram pre-recorded: Deepgram fetches the presigned GET URL itself; word timestamps and
diarization (speaker labels). Checked against developers.deepgram.com on 2026-10-31."""

import json
import urllib.error
import urllib.parse
import urllib.request

from worker.llm.errors import USER_AGENT, AIError
from worker.llm.registry import REGISTRY
from worker.transcript import Transcript, from_deepgram

from .errors import http_error

PARAMS = {
    "model": REGISTRY["transcription"]["deepgram"]["model"],
    "smart_format": "true",
    "diarize_model": "latest",
    "utterances": "true",
}
URL = "https://api.deepgram.com/v1/listen?" + urllib.parse.urlencode(PARAMS)


def transcribe(api_key: str, media_url: str) -> Transcript:
    req = urllib.request.Request(
        URL,
        data=json.dumps({"url": media_url}).encode(),
        headers={
            "Authorization": f"Token {api_key}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=900) as res:
            return from_deepgram(json.load(res))
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise http_error("deepgram", e.code, body, e.headers.get("retry-after")) from e
    except (urllib.error.URLError, TimeoutError) as e:
        msg = "Couldn't reach Deepgram. Retry in a minute."
        raise AIError("unknown", "deepgram", detail=repr(e), message=msg) from e
