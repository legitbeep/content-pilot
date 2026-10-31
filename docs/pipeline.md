---
covers:
  - apps/worker/pipeline
  - apps/worker/worker/r2.py
  - apps/worker/worker/transcript.py
  - apps/worker/tests/fixtures
last_updated: 2026-11-01
---
# Pipeline

`apps/worker/pipeline/__init__.py` → `STEPS` in order; `run(job, should_stop, on_step)` starts at
`job["resume_from_step"]` (module name; unknown → first step) or the first step, checking
`should_stop()` before each and calling `on_step(name, index, total)` so `main.py` can record
`current_step`, `progress` and `steps`. After the last step the job is `done` (`finished_at` set).

**Built today: `probe`, `transcribe`.** `nsfw_check`, `brand_fit`, `extract_clips` are stubs and
not in `STEPS` yet, so a job is `done` right after transcription with
`note = "Clip extraction not built yet"`.

## Contract for every step
- Module `pipeline/<name>.py` exposing `run(job: dict) -> None`.
- **Idempotent**: re-running after a crash/retry must not duplicate rows or files
  (upsert, deterministic R2 keys, check-before-write).
- Write `jobs.current_step` before starting (caller's job, when implemented).
- An `AIError` from the adapters (`worker/llm`, `worker/transcription`) is turned into a
  `StepError` by `pipeline.run` (message → `jobs.error`, provider response → `jobs.error_detail`).
- Raise `NeedsInput(request, resume_from)` to pause. Raise `StepError(message, detail)` for a
  failure the user can act on: `message` → `jobs.error` (shown as-is), `detail` →
  `jobs.error_detail`. Any other exception fails the job with a generic message + traceback.
  Exceptions live in `pipeline/errors.py`; outcomes are handled in `main.py` (`docs/queue.md`).

## Steps
| # | Step | Input | Output | Failure |
|---|---|---|---|---|
| 0 | `probe` | `source_key` (presigned GET URL, `worker/r2.py`) | `ffprobe` → `jobs.media` `{duration_s, width, height, has_audio}`, `jobs.duration_s` | unreadable file, no video stream, **no audio track**, or > 60 min → failed with a clear message |
| 1 | `transcribe` | presigned GET URL → `transcribe(user_id, url)` (`worker/transcription`, `docs/llm.md`): Deepgram or Groq Whisper | R2 `transcripts/<job_id>.json` (our format); `jobs.transcript_path` | no key → failed with "Add an AI provider key in Settings to use this."; 401/403 (own key marked `invalid_at`) / 402 / other → failed with a user message. Retry after adding a key resumes here |
| 2 | `nsfw_check` | transcript (+ sampled frames later) | pass/fail | **hard block** → failed, source deleted immediately |
| 3 | `brand_fit` | transcript, `brand_profile`, active `brand_rules` | pass or question | **soft** → `NeedsInput(question, "extract_clips")` |
| 4 | `extract_clips` | transcript, brand memory, `generate_json` (`worker/llm`, task `extract_clips`, `docs/llm.md`) | per candidate: clip file in R2, `clips` row (reason, word slice), initial `timelines` row | LLM/FFmpeg error → failed (retry resumes here) |

## Transcripts
- Provider calls (Deepgram, Groq Whisper) live in `worker/transcription` (`docs/llm.md`).
  Skipped when `transcript_path` is already set and the object exists (idempotent).
- Full transcript lives only in R2 at `transcripts/<job_id>.json`; path on `jobs.transcript_path`.
  **Our format** (pydantic `worker/transcript.py`, mirrored as `Transcript` in `$lib/entities/job`),
  times in source seconds, speakers 0-based or `null` when the provider has no speaker labels
  (Groq); downstream code must handle `speaker = null`:
  ```json
  { "provider": "deepgram", "duration_s": 312.4,
    "words": [{ "w": "Hello", "start": 0.12, "end": 0.40, "speaker": 0 }],
    "utterances": [{ "speaker": 0, "start": 0.12, "end": 3.9, "text": "Hello there." }] }
  ```
  `provider` is `deepgram` or `groq`. Deepgram: `w` is `punctuated_word`, utterances from its
  `utterances` (or built from speaker changes). Groq: words from `verbose_json` word timestamps,
  utterances from its segments. Nothing after `transcribe` reads the provider's shape.
  Tests: `tests/test_transcript.py` (`fixtures/deepgram_small.json`), `tests/test_transcription.py`
  (`fixtures/groq_chunks.json`: chunk offsets + overlap dedupe; missing-key job fails, retry works).
- Each clip stores its own **word slice** in `clips.words`: the words inside the clip file's range,
  times re-based to the clip file (t=0 = `file_start_s`), **handles included**.
- Captions and the editor agent read only `clips.words`, never the full transcript.

## Clip files (extract_clips)
For a candidate `[start_s, end_s]` in source seconds:
1. Handle range: `file_start_s = max(0, start_s - 5)`, `file_end_s = min(duration, end_s + 5)`.
2. Cut with re-encode for frame accuracy (stream copy snaps to keyframes and would skew word
   times): `ffmpeg -ss <file_start_s> -i <source> -t <file_end_s - file_start_s> -c:v libx264 -preset veryfast -c:a aac`
   → R2 `clips/<clip_id>/source.mp4` (`clips.file_key`).
3. Upsert `clips` on `(job_id, start_s, end_s)` (idempotent) with `reason`, file range, word slice.
4. Initial timeline: `sourceKey = file_key`, one segment
   `[start_s - file_start_s, end_s - file_start_s]`. Trims can extend into the handles.

## Cleanup (not a step)
`cleanup_source.py` runs from the worker's cleanup sweep, not from `STEPS`. Trigger: the user
clicks **Proceed with editing** in the Clip Picker (`jobs.proceeded_at`), or 48h after
`finished_at`, whichever first. Query: `status = 'done' and source_deleted_at is null and
(proceeded_at is not null or finished_at < now() - interval '48 hours')`.
Deletes the source video and every clip file where `selected = false` (sets their `file_key`
to null; rows stay as a negative signal for brand memory), then sets `source_deleted_at`.
Missing objects count as deleted (idempotent). Selected clips keep their files for rendering.

`worker/r2.py` helpers: `presigned_get`, `put_json`, `exists`, `upload_file(path, key, content_type)`,
`delete(key)` (missing = deleted).

Rendering (timeline → video) and publishing are separate worker loops
(`docs/timeline.md`, `docs/publishing.md`).
