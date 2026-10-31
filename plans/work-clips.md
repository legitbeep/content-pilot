# Plan 5 work plan (feat/clips)

Contracts from plans/STATUS.md "Wave 2 overlap + ownership" are binding.

## Phase 0 (done, bb9df33)
`supabase/migrations/20261101200000_p5_clips.sql`, applied with psql (twice, idempotent):
`clip_feedback` (exact STATUS contract, owner RLS), `jobs.memory_snapshot`, `jobs.user_intent`,
`clips.hook/reasons/scores/features/ranking_score/thumb_key`.

## Phase 1: memory snapshot, nsfw_check, brand_fit, needs_input sheet
- Web `queue ?/create`: load brand profile + rules, `buildMemoryContext(..., { scope: 'clip_selection' })`
  (unchanged) → `jobs.memory_snapshot`. Upload guard stays `requireAIKeys('both')`.
- Worker `pipeline/text.py`: transcript → sentence lines `[i] mm:ss text`, chunked to
  `max_input_tokens` (speaker null handled).
- `pipeline/nsfw_check.py`: ffmpeg 1 fps → raw 224x224 RGB frames streamed → onnxruntime
  (Falconsai/nsfw_image_detection, Apache-2.0, ONNX int8 port pinned by commit + sha256, baked
  into the Docker image with `ADD --checksum`) + LLM `moderate_text`. Pure `decide()` with
  thresholds; explicit → StepError + source deleted; borderline → NeedsInput(kind nsfw,
  flagged ranges, Continue/Cancel, resume brand_fit). Tests mock scores.
- `pipeline/brand_fit.py`: LLM `brand_fit` (summary, topics, conflict, question) vs
  `memory_snapshot` + request. Conflict → NeedsInput(kind brand_fit, options, free text,
  resume extract_clips). No snapshot → pass.
- Web answer: brand_fit answer → `jobs.user_intent`; "Cancel" = delete the job (needs_input
  gains `delete`). Sheet renders options as buttons, free text when allowed, nsfw flagged times.
- STEPS = probe, transcribe, nsfw_check, brand_fit (extract_clips joins in phase 2).

## Phase 2: extract_clips
- `ranking.py` stub: `apply_weights(user_id, candidates)` → ranking_score = mean(scores), desc.
- `pipeline/extract_clips.py`: ~5-min windows (30s overlap) of sentences; LLM `extract_clips`
  returns sentence-index ranges (snapped to sentence boundaries) + hook, topic, hook_type,
  2-4 reasons, scores, description; reasons cite rules / request / user_intent. Merge overlaps,
  filter length, apply_weights, top 8 (max 15). Per clip (uuid5 ids): re-encode cut with 5s
  handles → `clips/<id>/source.mp4`, thumb `clips/<id>/thumb.jpg`, word slice, features
  `{topic, length_bucket short|medium|long, hook_type}`, v2 timeline. Re-run replaces
  unselected candidates. Done note removed from main.py.
- Seeds `pnpm seed:clips` / `:clean` (dev-clips user, `note = 'seed:clips'`): done job with
  candidates (picker), needs_input brand_fit + nsfw jobs (sheet), a pending job with generated
  video + transcript; `--run <job>` runs the pipeline with a fake LLM + fake classifier.

## Phase 3: Clip Picker + cleanup
- `/clips/[jobId]`: Linear list (thumb, duration, hook, reasons, excerpt, subtle scores),
  preview of the focused row, J/K move, X / click toggles selection; approve/reject with reason
  chips → `clip_feedback` rows. "Proceed with editing" → `selected`, `proceeded_at` →
  `/editor/<firstClipId>`. Queue done rows link here; `/clips?job=` redirects.
- Worker `loops/cleanup.py` (one line in main.py, `cleanup` in run_once): runs
  `cleanup_source` for proceeded or 48h-old done jobs.
- Docs: pipeline, queue, data-model, brand-memory (who reads), env, pages. Handoff.
