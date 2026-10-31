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

`STEPS` = `probe`, `transcribe`, `nsfw_check`, `brand_fit`, `extract_clips`.

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
| 2 | `nsfw_check` | 1 frame/s (ffmpeg over the presigned GET, 224×224 RGB streamed) → NSFW image model; transcript → `moderate_text` per chunk | pass, question, or fail | `decide()`: any text chunk `explicit`, or ≥3 frames (and ≥5% of frames) with p ≥ 0.9 → **failed** "This video contains explicit content and can't be processed." (no override), source deleted at once (`source_deleted_at`). Any text `borderline` or any frame ≥ 0.6 → `NeedsInput` kind `nsfw` with `flagged` time ranges, options Continue / Cancel, resume `brand_fit` |
| 3 | `brand_fit` | transcript + `jobs.memory_snapshot` + `request` → `brand_fit` (summary, topics, conflict, question) | pass or question | no snapshot → pass. Conflict → `NeedsInput` kind `brand_fit` (question, options "Critique or contrast it" / "Proceed anyway" / "Cancel", free text), resume `extract_clips`. The answer is stored as `jobs.user_intent` (job-scoped, never a brand rule) |
| 4 | `extract_clips` | transcript, brand memory, `generate_json` (`worker/llm`, task `extract_clips`, `docs/llm.md`) | per candidate: clip file in R2, `clips` row (reason, word slice), initial `timelines` row | LLM/FFmpeg error → failed (retry resumes here) |

## Brand memory snapshot
The web `?/create` action (`routes/(authed)/(shell)/queue`) runs `buildMemoryContext(profile,
rules, { scope: 'clip_selection' })` (`docs/brand-memory.md`) and stores the text on
`jobs.memory_snapshot`. The worker reads only this snapshot (no Python copy of the memory logic),
so a job is reproducible even if rules change later.

## AI inputs (`pipeline/text.py`)
Transcript → sentences (split at `.?!`, an utterance/segment end — Groq words have no punctuation —
a pause > 1s, or 40 words; speakers ignored, may be `null`) → lines `[i] mm:ss text`. Long inputs
are chunked to the provider's `max_input_tokens` minus room for the prompt (~4 chars/token).

## NSFW image model
`Falconsai/nsfw_image_detection` (ViT, labels normal/nsfw, **Apache-2.0**), run as the ONNX int8
port `onnx-community/nsfw_image_detection-ONNX` (`onnx/model_quantized.onnx`, 83 MB) with
`onnxruntime` on CPU (~0.3 s/frame locally). The Dockerfile bakes it in with `ADD --checksum`
pinned to a commit, so the worker never downloads weights at runtime. Outside Docker:
`pnpm nsfw:model` downloads the same file to `apps/worker/models/nsfw.onnx` (gitignored);
`NSFW_MODEL_PATH` overrides the path. Missing model → the step fails with a clear message.

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
