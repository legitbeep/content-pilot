# Docs: docs/pipeline.md
"""Transcribe the source with the user's Deepgram key (BYOK). Deepgram fetches the presigned GET
URL itself. Writes R2 transcripts/<job_id>.json (our format, worker/transcript.py) plus the raw
response at transcripts/<job_id>.deepgram.json, and sets jobs.transcript_path."""

import json
import urllib.error
import urllib.parse
import urllib.request

from worker import db, keys, r2
from worker.transcript import from_deepgram

from .errors import StepError

# Checked against developers.deepgram.com on 2026-10-31. Word timestamps are always included.
PARAMS = {
    "model": "nova-3",
    "smart_format": "true",
    "diarize_model": "latest",
    "utterances": "true",
}
URL = "https://api.deepgram.com/v1/listen?" + urllib.parse.urlencode(PARAMS)


def call_deepgram(api_key: str, media_url: str) -> dict:
    req = urllib.request.Request(
        URL,
        data=json.dumps({"url": media_url}).encode(),
        headers={"Authorization": f"Token {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=900) as res:
        return json.load(res)


def run(job: dict) -> None:
    key = f"transcripts/{job['id']}.json"
    if job.get("transcript_path") == key and r2.exists(key):
        return  # already transcribed (retry/re-queue)

    user_id = job["user_id"]
    try:
        api_key = keys.get_key(user_id, "deepgram")
    except keys.MissingKey as e:
        raise StepError("Add your Deepgram key in Settings, then retry.") from e

    try:
        raw = call_deepgram(api_key, r2.presigned_get(job["source_key"]))
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:2000]
        detail = f"Deepgram HTTP {e.code}: {body}"
        if e.code in (401, 403):
            keys.mark_invalid(user_id, "deepgram")
            raise StepError("Deepgram rejected the API key. Update it in Settings.", detail) from e
        if e.code == 402:
            raise StepError("Deepgram says your account is out of credit.", detail) from e
        raise StepError(
            "Deepgram couldn't transcribe this video. Retry in a minute.", detail
        ) from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise StepError("Couldn't reach Deepgram. Retry in a minute.", repr(e)) from e
    keys.mark_valid(user_id, "deepgram")

    transcript = from_deepgram(raw)
    r2.put_json(f"transcripts/{job['id']}.deepgram.json", raw)
    r2.put_json(key, transcript.model_dump())
    db.update_job(job["id"], transcript_path=key)
    job["transcript_path"] = key
