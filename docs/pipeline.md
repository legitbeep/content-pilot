---
covers:
  - apps/worker/pipeline
  - apps/worker/worker/r2.py
  - apps/worker/worker/transcript.py
  - apps/worker/tests/fixtures
  - apps/worker/ranking.py
  - apps/worker/seeds/clips.py
  - apps/worker/loops/cleanup.py
  - apps/web/src/lib/entities/clip
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
| 4 | `extract_clips` | sentences in 5-min windows (30s overlap) + `memory_snapshot` + `request` + `user_intent` → `extract_clips` per window | per clip: file + thumbnail in R2, `clips` row, initial v2 `timelines` row | LLM/FFmpeg error → failed (retry resumes here) |

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
The same module checks **editor uploads** (voiceover, music, extra videos) before each render:
`check_upload(user_id, key, kind)`, explicit → upload deleted + render failed, verdict cached at
`safety/<key>.json` (`docs/timeline.md` "Render"). Video uploads get the frame check only (no
speech check, `ponytail:` note); audio gets transcript moderation.

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

## Clip extraction (extract_clips)
1. Per window the LLM returns up to 5 moments as **sentence index ranges** (so cuts snap to
   sentence boundaries) with `hook`, `topic`, `hook_type` (question | contrarian | story | tip |
   reaction), 2-4 `reasons` (citing brand memory, the request or `user_intent`, e.g. "Matches your
   core topic: hygiene"), `scores` 0-1 (`hook_strength`, `standalone`, `brand_fit`,
   `request_match`) and a 1-2 sentence `description`.
2. `snap`: extend by whole sentences to ≥ 15s, shrink to ≤ 60s, drop if still out of range.
3. `merge`: drop a candidate overlapping a better one (sum of scores) by > half the shorter clip.
4. `ranking.apply_weights(user_id, candidates)` (`apps/worker/ranking.py`) sets `ranking_score`
   and orders them. Plan 5 ships a stub (mean of `scores`, desc); plan 9 replaces the file
   (feature weights, exploration). Keep the top N: 8, or "<n> clips" in the request (max 15).
5. `features` = `{topic (lowercase), length_bucket: short (≤30s) | medium (≤60s) | long, hook_type}`
   (keys of plan 9's `feature_weights`: `topic:<x>`, `length:<bucket>`, `hook:<type>`).
6. Re-running replaces this job's **unselected** candidates (rows + R2 files). Clip ids are
   uuid5(job, range), so R2 keys are deterministic.

For each kept candidate `[start_s, end_s]` in source seconds:
1. Handle range: `file_start_s = max(0, start_s - 5)`, `file_end_s = min(duration, end_s + 5)`.
2. Cut with re-encode for frame accuracy (stream copy snaps to keyframes and would skew word
   times): `ffmpeg -ss <file_start_s> -i <source> -t <file_end_s - file_start_s> -c:v libx264 -preset veryfast -c:a aac`
   → R2 `clips/<clip_id>/source.mp4` (`clips.file_key`); thumbnail (480p JPEG, 0.5s into the clip)
   → `clips/<clip_id>/thumb.jpg` (`clips.thumb_key`).
3. Upsert `clips` on `(job_id, start_s, end_s)` (idempotent) with `reason` (= first reason),
   `reasons`, `hook`, `description`, `scores`, `features`, `ranking_score` (also `score`),
   file range, word slice.
4. Initial timeline (v2, validated by `worker/timeline.py`, insert-if-missing): `sourceKey =
   file_key`, 9:16, captions on, one segment `[start_s - file_start_s, end_s - file_start_s]`.
   Trims can extend into the handles.

## Seed data (plan 5)
`apps/worker/seeds/clips.py`, for the dev-login user `dev-clips@clip-studio.test` (or `SEED_EMAIL`),
no AI keys needed: `pnpm seed:clips` creates/resets job A (on-brand hand-washing talk) and B (roast
chicken vs a vegan brand) as pending, with generated test videos + transcripts in R2, C as a
needs_input nsfw question, and 2 placeholder `processing` jobs ("Seed: worker slot") so a shared
worker (per-user limit 2) never claims A/B. `pnpm seed:clips:run` runs the real pipeline on A and B
(probe, NSFW image model, ffmpeg, R2, DB) with a **fake LLM**: A → done with 6 clips, B → the
brand_fit question; answer it in the Queue and run again → B done, reasons echo the answer.
`pnpm seed:clips:clean` deletes exactly these jobs and their R2 objects.

## Cleanup (not a step)
`cleanup_source.py` runs from the worker's cleanup loop (`loops/cleanup.py`, every 30s; one line in
`main.py`; `python -m worker.run_once cleanup <job_id>` runs one due job), not from `STEPS`. Trigger: the user
clicks **Proceed with editing** in the Clip Picker (`jobs.proceeded_at`), or 48h after
`finished_at`, whichever first. Query: `status = 'done' and source_deleted_at is null and
(proceeded_at is not null or finished_at < now() - interval '48 hours')`.
Deletes the source video and every clip file + thumbnail where `selected = false` (sets their
`file_key`/`thumb_key` to null; rows stay as a negative signal for brand memory), then sets
`source_deleted_at`.
Missing objects count as deleted (idempotent). Selected clips keep their files for rendering.

`worker/r2.py` helpers: `presigned_get`, `put_json`, `exists`, `upload_file(path, key, content_type)`,
`delete(key)` (missing = deleted).

Rendering (timeline → video) and publishing are separate worker loops
(`docs/timeline.md`, `docs/publishing.md`).
