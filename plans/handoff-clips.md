# Handoff: plan 5 (feat/clips)

Commits: bb9df33 (migration), 2cc5770 (phase 1), fed7c28 (phase 2), a07f418 (phase 3), + this note.
`pnpm check` passes; `pnpm test`: schema 11, web 94, worker 132.

## Built
- **Memory snapshot**: queue `?/create` stores `buildMemoryContext(profile, rules, { scope: 'clip_selection' })`
  (unchanged, plan 4's) on `jobs.memory_snapshot`. The worker reads only that text (no Python port).
  Upload guard unchanged (`requireAIKeys('both')`).
- **nsfw_check**: 1 fps frames (ffmpeg, streamed 224×224 RGB) → ONNX NSFW model on CPU + LLM
  `moderate_text` per transcript chunk. Pure `decide()` (unit-tested with mocked scores):
  explicit → failed "This video contains explicit content and can't be processed." + source
  deleted at once; borderline → `needs_input` (kind `nsfw`, flagged time ranges, Continue/Cancel,
  resume `brand_fit`).
- **brand_fit**: LLM `brand_fit` vs snapshot + request → `needs_input` (kind `brand_fit`, question,
  "Critique or contrast it" / "Proceed anyway" / "Cancel" + free text, resume `extract_clips`).
  The answer is saved as `jobs.user_intent` (web `?/answer`), never a brand rule.
- **extract_clips**: 5-min windows / 30s overlap of sentences (`pipeline/text.py`, handles
  `speaker = null`, chunks to `max_input_tokens`), LLM returns sentence-index ranges (snapped),
  hook, topic, hook_type, reasons, scores, description → length 15-60s → merge overlaps →
  `ranking.apply_weights` → top 8 (or "N clips" in the request, max 15). Per clip: re-encoded cut
  with 5s handles `clips/<id>/source.mp4`, thumbnail `clips/<id>/thumb.jpg`, word slice, features,
  v2 timeline (validated by the pydantic mirror).
- **Queue UI**: needs_input sheet shows options as buttons (gated by `<RequiresAI>`), free text,
  flagged times; "Cancel" = delete (needs_input now allows `delete`). Done rows → `/clips/<id>`.
- **Clip Picker** `/clips/[jobId]`: Linear list, preview of the focused clip, J/K, X/checkbox
  select (= approve), ✓/✗ with reason chips → `clip_feedback`; "Proceed with editing" →
  `selected`, `proceeded_at` → `/editor/<first>`.
- **Cleanup**: `pipeline/cleanup_source.py` + `loops/cleanup.py` (30s poll; due = proceeded or
  48h after finish); `run_once cleanup <job_id>`.
- Removed main.py's "Clip extraction not built yet" done note.

## Contracts (STATUS "Wave 2 overlap")
- `clip_feedback(id, user_id, clip_id, job_id, decision approved|rejected, reason null, created_at)`,
  owner RLS. Append-only; one row per approve/reject click. Reasons: Off-brand, Boring, Too long,
  Bad cut, Other. (Applied to the shared DB before phase 1, as asked.)
- `clips.features = {topic (lowercased), length_bucket short(<=30s)|medium(<=60s)|long, hook_type}`;
  `clips.ranking_score` (also copied to `score`); `clips.scores = {hook_strength, standalone,
  brand_fit, request_match}` 0-1.
- `apps/worker/ranking.py` stub: `apply_weights(user_id: str, candidates: list[dict]) -> list[dict]`
  (mean of `scores`, desc). **Merge: take plan 9's file on the add/add conflict.**
- `jobs.input_request` shape: `{kind: nsfw|brand_fit, question, options[], allow_text, flagged?[{start,end,why}], summary?, topics?, answer?}`
  (`InputRequest` in `$lib/entities/job`).
- New web entity `$lib/entities/clip` (`ClipCandidate`, `REJECT_REASONS`, `excerpt`).
- LLM adapter: no fixes, no new tasks (uses moderate_text, brand_fit, extract_clips).

## Migrations
`supabase/migrations/20261101200000_p5_clips.sql` (applied with psql, re-applied once to prove
idempotency): `clip_feedback` + RLS + index; `jobs.memory_snapshot`, `jobs.user_intent`;
`clips.hook, reasons jsonb, scores jsonb, features jsonb, ranking_score, thumb_key`.

## Shared files touched
- `apps/worker/main.py`: one loop line (`cleanup.loop`), removed the TODO + `DONE_NOTE` (done jobs
  no longer get a note; `tests/test_main.py` updated).
- `apps/worker/worker/run_once.py`: `cleanup` handler line.
- `apps/worker/tests/test_transcription.py`: stubs the 3 new steps (it runs the whole pipeline).
- `apps/worker/Dockerfile` (model ADD), `.dockerignore`, root `.gitignore` (`apps/worker/models/`),
  `apps/worker/.env.example` + `docs/env.md` (`NSFW_MODEL_PATH`), `package.json` scripts,
  `apps/worker/pyproject.toml`/`uv.lock` (+onnxruntime, numpy).
- `apps/worker/worker/r2.py`: + `get_bytes`.
- Web: queue `+page.server.ts`, `entities/job` (model, transitions), `widgets/job-queue`.
- Docs: pipeline, queue, data-model, brand-memory ("Who reads it" + buildMemoryContext note only;
  plan 7's sections untouched), env, pages, architecture.
- NOT touched: `shortcuts.ts` (plan 7 owns it). Picker keys are page-local and listed in
  pages.md; `.claude/rules/ui.md` says shortcuts belong in shortcuts.ts → move them at merge.

## NSFW model
`Falconsai/nsfw_image_detection` (ViT, labels normal/nsfw), **Apache-2.0** (verified on the HF
model card, `license: apache-2.0`). Used as the ONNX int8 port `onnx-community/nsfw_image_detection-ONNX`
(`onnx/model_quantized.onnx`, 83 MB, derived work of the same model). Baked into the image with
`ADD --checksum=sha256:d9afb1e0…` pinned to commit `1ceb3c7f…` → no runtime download. Local:
`pnpm nsfw:model` (same file + sha check, gitignored). ~0.3 s/frame on CPU → a 60-min video spends
~15-20 min in nsfw_check (ponytail note in code; sample sparser if that hurts). The Docker build
itself was not run here (no rebuild of the shared worker).

## Seed commands (dev-clips@clip-studio.test, no AI keys)
- `pnpm seed:clips` — jobs A "Seed: hand washing" + B "Seed: chicken" (pending, generated
  video + transcript), C "Seed: borderline" (needs_input nsfw), + 2 **"Seed: worker slot"**
  placeholder `processing` jobs. Why: main's Docker worker is running on the shared DB and claimed
  my first seed job; the placeholders fill this user's 2-processing limit so it can't.
- `pnpm seed:clips:run` — real pipeline (probe, NSFW model, ffmpeg, R2, DB) with a **fake LLM** on
  A and B. `--answer "Critique or contrast it"` performs the Queue's answer write for B first
  (the Queue can't answer without keys: 409).
- `pnpm seed:clips:clean` — deletes exactly these 5 jobs (cascade) + R2 objects.
- Current state: seeds present; A proceeded (2 selected, cleanup run: source + 4 unselected
  files gone, verified in R2); B done with reasons "Fits your intent: Critique or contrast it".

## Needs human (real keys; do on a branch/main with a worker running this code)
1. Settings → add an LLM key (Gemini/Groq/Claude) + transcription key (Deepgram or Groq).
2. Brand memory: make a vegan brand (Brand memory → You told us: niche "vegan cooking",
   off-limits "meat"; Rules: add "Only promote plant-based food." scope clip_selection).
3. Vegan + chicken: Queue → upload a short real video of someone cooking chicken (any 2-5 min
   talking clip) → wait. Expected: status Needs input; sheet question like "This video is about
   cooking chicken, which conflicts with your vegan brand. What do you want to do?" with 3 options +
   text box. Click "Critique or contrast it" → job goes pending → done. Open clips → reasons
   mention the critique/contrast angle; the picker shows "Your direction for this video: …".
4. On-brand: upload a video on a core topic → no question → done with 5-10 clips whose reasons
   cite the brand (e.g. "Matches your core topic: …"). Check hooks start on sentence boundaries
   and the preview starts at the clip start (after the 5s handle).
5. Picker: select 2 (X), reject 1 with "Boring", Proceed → editor opens with the 2 clips; within
   ~30s R2 has only those 2 clips' files (+ thumbnails); `jobs.source_deleted_at` set.
6. Docker: `docker compose build worker` succeeds (needs BuildKit for `ADD --checksum`), then
   a job runs nsfw_check without "safety check isn't set up".
7. Groq JSON mode for the 3 tasks is untested with real keys (fake LLM only).

## Risks
- **Shared worker**: until merged, main's running worker claims any pending job with old code
  (ends `done` with no clips). Real-key testing of this branch needs that worker stopped or a
  worker built from this branch.
- `user_intent` is only written for `brand_fit` answers; nsfw "Continue" stores just the answer.
- Explicit verdict deletes the source; Retry on such a job will fail at probe (by design: no override).
- nsfw_check is slow for long videos on CPU (see above); text moderation of a borderline-heavy
  podcast may ask often (thresholds in `nsfw_check.py`).
- Re-running extract_clips (retry) replaces unselected candidates, so earlier `clip_feedback` rows
  for them cascade-delete.
- After merge, the cleanup loop deletes sources of every done job older than 48h (as designed),
  including older seed/demo jobs.
- Picker `X`/`J`/`K` aren't in the `?` sheet until moved into shortcuts.ts.
