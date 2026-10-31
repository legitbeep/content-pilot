---
covers:
  - apps/worker/pipeline
last_updated: 2026-10-31
---
# Pipeline

`apps/worker/pipeline/__init__.py` → `STEPS` in order; `run(job, should_stop)` starts at
`job["resume_from_step"]` (module name) or the first step, checking `should_stop()` before each.
After the last step the job is `done` (`finished_at` set).

## Contract for every step
- Module `pipeline/<name>.py` exposing `run(job: dict) -> None`.
- **Idempotent**: re-running after a crash/retry must not duplicate rows or files
  (upsert, deterministic R2 keys, check-before-write).
- Write `jobs.current_step` before starting (caller's job, when implemented).
- Raise `NeedsInput(request, resume_from)` to pause; any other exception fails the job.

## Steps
| # | Step | Input | Output | Failure |
|---|---|---|---|---|
| 1 | `transcribe` | `source_key` in R2, user's transcription key | full transcript JSON → R2 `transcripts/<job_id>.json`; `jobs.transcript_path` | provider error → failed |
| 2 | `nsfw_check` | transcript (+ sampled frames later) | pass/fail | **hard block** → failed, source deleted immediately |
| 3 | `brand_fit` | transcript, `brand_profile`, active `brand_rules` | pass or question | **soft** → `NeedsInput(question, "extract_clips")` |
| 4 | `extract_clips` | transcript, brand memory, user's Anthropic key | per candidate: clip file in R2, `clips` row (reason, word slice), initial `timelines` row | LLM/FFmpeg error → failed (retry resumes here) |

## Transcripts
- Full transcript (word-level timestamps, source seconds) lives only in R2 at
  `transcripts/<job_id>.json`; path on `jobs.transcript_path`. Shape:
  `{ "words": [{ "w": "Hello", "start": 0.12, "end": 0.40 }], "provider": "deepgram" }`.
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

Rendering (timeline → video) and publishing are separate worker loops
(`docs/timeline.md`, `docs/publishing.md`).
