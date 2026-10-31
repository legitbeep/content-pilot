---
covers:
  - apps/worker/pipeline
last_updated: 2026-10-31
---
# Pipeline

`apps/worker/pipeline/__init__.py` → `STEPS` in order; `run(job, should_stop)` starts at
`job["resume_from_step"]` (module name) or the first step, checking `should_stop()` before each.

## Contract for every step
- Module `pipeline/<name>.py` exposing `run(job: dict) -> None`.
- **Idempotent**: re-running after a crash/retry must not duplicate rows or files
  (upsert, deterministic R2 keys, check-before-write).
- Write `jobs.current_step` before starting (caller's job, when implemented).
- Raise `NeedsInput(request, resume_from)` to pause; any other exception fails the job.

## Steps
| # | Step | Input | Output | Failure |
|---|---|---|---|---|
| 1 | `transcribe` | `source_key` in R2, user's transcription key | transcript (words + timestamps) stored for the job | provider error → failed |
| 2 | `nsfw_check` | transcript (+ sampled frames later) | pass/fail | **hard block** → failed, source deleted |
| 3 | `brand_fit` | transcript, `brand_profile`, active `brand_rules` | pass or question | **soft** → `NeedsInput(question, "extract_clips")` |
| 4 | `extract_clips` | transcript, brand memory, user's Anthropic key | `clips` rows with `reason` + initial `timelines` | LLM error → failed (retry resumes here) |
| 5 | `cleanup_source` | `source_key` | R2 object deleted | missing object = success (idempotent) |

Transcript storage location is not decided yet (jsonb column on jobs vs R2 JSON) — decide when
building `transcribe`, then update `docs/data-model.md`.

Rendering (timeline → video) and publishing are *not* pipeline steps; they're separate worker
loops (`docs/timeline.md`, `docs/publishing.md`).
