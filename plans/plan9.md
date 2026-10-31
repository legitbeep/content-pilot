# Plan 9: Performance loop, LLM captions, Home, recommendations

Wave 2 (needs plans 4 and 8 merged). Branch `feat/performance`, dev port 5175.
Read plans/parallel-rules.md, CLAUDE.md, docs/INDEX.md, then only: publishing,
brand-memory, llm, pipeline, data-model, design-system. Plan mode first. Commit per
phase. Create docs/performance.md and add it to INDEX.md.
All AI calls go through the LLM adapter (tasks `captions`, `learn_rules`,
`recommendations`); never import a provider SDK.

## Phase 1: Baselines + checkpoints

1. On YouTube connect (hook into plan 8's callback), fetch the channel's last 20
   videos. Reconstruct views at 2, 7, 14 and 30 days from daily views via the YouTube
   Analytics API (verify it supports this); fall back to total views if not, and note
   which method was used. Store in `baselines`.
2. When a post becomes `posted`, create `post_checkpoints` at 48h, 7d, 14d, 30d.
3. Worker loop (loops/checkpoints.py): process due checkpoints, fetch stats (views,
   likes, comments, average view percentage if available), store `post_metrics`,
   compute `score = views / median baseline at the same checkpoint`. Fewer than 5
   baseline values -> `insufficient_data`, no verdict.
4. Dev-only CLI `pnpm checkpoints:run-now <post_id>` to test without waiting.

## Phase 2: Learning + ranking

1. Verdict at 30d (provisional at 7d): boost (> 1.5), downgrade (< 0.6), neutral.
2. Update `feature_weights` per user and feature value (topic:x, length:short,
   hook:question) with a simple moving average. Write a `change_log` entry for each
   meaningful change ("Short clips about hygiene got 3x your usual views. Ranking
   them higher.").
3. Same feature + same verdict on 3 posts -> brand_rules candidate (source:
   performance), through the same promotion rules as edit-learned rules.
4. Implement `apply_weights` in the worker (plan 5 left it as identity). Keep ~15%
   of shown candidates as exploration regardless of weights.

## Phase 3: LLM captions

1. Replace the template `CaptionGenerator` with an LLM version using
   `buildMemoryContext(..., { scope: "copy" })`, the clip description and words.
   Per platform: YouTube (title <= 100 chars, description, tags), Instagram,
   LinkedIn, X (<= 280 chars).
2. Log user edits to generated captions as `edit_events` of kind `caption`.

## Phase 4: Home

1. Two primary actions: "Generate clips" (to Queue upload) and "Recommended
   long-form videos".
2. Charts (shadcn-svelte chart component): views over time, posts per week, top
   clips, score distribution. Empty states when there's no data.
3. Insight cards from `change_log`.
4. Rating nudge: for posts with a surprising score after 7d, ask 1-5 stars + note,
   stored as extra evidence.
5. Recommendations: optional region field -> YouTube search with Creative Commons
   licence and long duration filters, queries built from core topics plus the
   region's trending videos as a signal; the LLM picks the top 3-4 with a reason
   each. Show title, channel, licence, reason, "Open on YouTube". Do not download
   videos from YouTube; the user uploads the file to the Queue themselves.

## Acceptance

- pnpm check and pnpm test pass (score, verdict, weight update, apply_weights).
- Connecting YouTube seeds baselines; `checkpoints:run-now` on a post records
  metrics and a score.
- Seeded verdicts change extraction ranking and create a change_log entry and, after
  3 repeats, a candidate rule.
- Captions differ per platform and follow brand rules.
- Handoff note written.
