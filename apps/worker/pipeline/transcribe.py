# Docs: docs/pipeline.md
"""Transcribe the source through the transcription adapter (worker/transcription, docs/llm.md):
the user's Deepgram or Groq key, or the demo key for allowlisted users. Writes R2
transcripts/<job_id>.json (our format, worker/transcript.py) and sets jobs.transcript_path.
No usable key -> AIError("missing_key") -> the job fails with that message (pipeline.run)."""

from worker import db, r2
from worker.transcription import transcribe


def run(job: dict) -> None:
    key = f"transcripts/{job['id']}.json"
    if job.get("transcript_path") == key and r2.exists(key):
        return  # already transcribed (retry/re-queue)

    transcript = transcribe(job["user_id"], r2.presigned_get(job["source_key"]))
    r2.put_json(key, transcript.model_dump())
    db.update_job(job["id"], transcript_path=key)
    job["transcript_path"] = key
