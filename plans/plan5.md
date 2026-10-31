# Plan 5: Safety, brand-fit, clip extraction, Clip Picker

Wave 2 (needs plan 4 merged). Branch `feat/clips`, dev port 5173.
Read plans/parallel-rules.md, CLAUDE.md, docs/INDEX.md, then only: pipeline, queue,
brand-memory, llm, timeline, design-system.
All AI calls go through the LLM adapter (docs/llm.md). Plan mode first. Commit after each phase.

## Phase 1: Memory snapshot, NSFW check, brand-fit

1. **Memory snapshot:** when the web app confirms a new job, it calls
   `buildMemoryContext(..., { scope: "clip_selection" })` and stores the text on
   `jobs.memory_snapshot`. The worker reads only this snapshot, so there is no
   Python copy of the memory logic and every job is reproducible.
2. **AI calls:** use the worker LLM adapter from plan-llm (tasks `moderate_text`,
   `brand_fit`, `extract_clips`). Never import a provider SDK. Handle
   `speaker = null` in transcripts (Groq Whisper has no speaker labels), and chunk
   input to `maxInputTokens` for the chosen provider.
3. **nsfw_check step:**
   - Sample 1 frame/second with ffmpeg from a presigned GET URL; classify with a
     small open-source NSFW image model on CPU (verify its licence; bake the weights
     into the Docker image so there are no runtime downloads).
   - Moderate the transcript text with the LLM.
   - Clearly explicit -> `failed`, error "This video contains explicit content and
     can't be processed." No override.
   - Borderline -> `needs_input` with flagged timestamps and options
     "Continue" / "Cancel".
   - Unit-test the decision logic with mocked classifier scores.
4. **brand_fit step:** LLM compares a transcript summary and topics with the memory
   snapshot. On conflict -> `needs_input` with a plain question, e.g. "This video is
   about cooking chicken, which conflicts with your vegan brand. What do you want to
   do?" Options: "Critique or contrast it", "Proceed anyway", "Cancel", plus free
   text. The answer is stored as `jobs.user_intent` (job-scoped, never a brand rule).
   Resume from `extract_clips`.
5. **Queue UI:** `needs_input` rows open a sheet with the question and options.

## Phase 2: Clip extraction

1. Split the transcript into ~5-minute windows with overlap. For each window, the LLM
   returns candidate moments: start/end snapped to sentence boundaries, hook line,
   topic, hook type (question, contrarian, story, tip, reaction), 2-4 reasons, and
   scores (hook strength, standalone, brand fit, request match). Reasons cite brand
   rules, the user's request or `user_intent` when relevant ("Matches your core
   topic: hygiene").
2. Merge overlapping candidates across windows, rank, keep top N (default 8, max 15).
   Default length 15-60s.
3. Store `features jsonb` (topic, length bucket, hook type) and `ranking_score` per
   clip. Ranking goes through `apply_weights(scores, features)`, an identity function
   for now; plan 9 implements it.
4. For each candidate: re-encode cut (accurate, not stream copy) with 5s handles to
   `clips/{clip_id}.mp4`, thumbnail to `clips/{clip_id}.jpg`, the word slice with
   times relative to the clip file, and a 1-2 sentence description.

## Phase 3: Clip Picker (`/clips/[jobId]`)

1. Linear-style list. Each row: thumbnail, duration, hook line, reasons, a transcript
   excerpt. Selected row plays a preview. Scores stay subtle (small, muted).
2. Select with X or click; approve/reject with reason chips (Off-brand, Boring, Too
   long, Bad cut, Other). Store every approval/rejection in `clip_feedback` (plan 7
   learns from it).
3. "Proceed with editing": mark selected clips, run `cleanup_source` (delete source +
   unselected clip files in R2), then go to `/editor/[firstClipId]` (route comes from
   plan 6).
4. Queue: `done` rows link to the picker.

## Acceptance

- pnpm check and pnpm test pass.
- Vegan test brand + chicken cooking video -> `needs_input` question; answering
  "Critique or contrast it" produces clips whose reasons reflect that intent.
- An on-brand video gives 5-10 clips with reasons that cite the brand.
- After "Proceed with editing", R2 contains only the selected clip files.
- Handoff note written.
