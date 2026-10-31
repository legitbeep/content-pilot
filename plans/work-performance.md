# Plan 9 work plan (performance)

Contracts: plans/STATUS.md "Wave 2 overlap + ownership". Checkpoints 48h / 7d / 14d / 30d
(14d is free: enum value + one row). Never call real YouTube or AI; fixtures + mocks only.

## Phase 1: baselines + checkpoints
- Migration `p9_performance.sql`: `post_checkpoints` (post_id, checkpoint, due_at, claimed_at,
  attempts, done_at, error; unique (post_id, checkpoint)); trigger on posts insert/update to
  `posted` creates the 4 rows; `post_metrics` + `avg_view_pct`, `verdict`, `rating`,
  `rating_note`; `platform_connections` + `baselines_seeded_at`, `baseline_method`;
  `feature_weights`, `change_log` (own RLS); `clips.features`/`ranking_score` nullable (plan 5's,
  already on the DB). The existing `baseline_seeds` table is "baselines" (no new table).
- `worker/yt_stats.py`: small YouTube read client (uploads playlist, daily views, video stats,
  avg view %). `YOUTUBE_FAKE=true` (or tests) -> `tests/fixtures/youtube/*.json` instead of HTTP.
- `loops/checkpoints.py`: tick = seed baselines for connections with `baselines_seeded_at` null,
  then claim due checkpoints (SKIP LOCKED) -> stats -> `post_metrics` with score
  (`views / median(newest 20 samples)`, < 5 -> null). `run_once(post_id)` processes the post's
  next undone checkpoint now. One line in main.py, `checkpoint` + `baseline` kinds in run_once,
  `pnpm checkpoints:run-now <post_id>` (sets YOUTUBE_FAKE).
- YouTube connect: `connectYoutube` resets `baselines_seeded_at` so the loop reseeds.

## Phase 2: learning + ranking
- `apps/worker/ranking.py`: `score`, `verdict` (7d provisional, 30d final; >1.5 boost, <0.6
  downgrade), `clip_features`, `recompute_weights` (mean score of the last 10 posts with that
  feature, using each post's latest verdict checkpoint), `apply_weights(user_id, candidates)`
  (weight multiplier clamped 0.5-2, every 7th slot from index 2 is a random exploration pick).
- After a verdict: recompute weights for the post's features -> `change_log` when a feature
  enters/leaves the boost/downgrade band; same feature + verdict on 3 posts -> `brand_rules`
  candidate (source performance, evidence items per STATUS, dedupe, never active).

## Phase 3: LLM captions
- `$lib/server/publishing/llm-captions.ts`: one `generateJSON` (task `captions`) for all 4
  platforms with `buildMemoryContext(profile, rules, { scope: 'copy' })`, clip description and
  words. Template stays the instant prefill (now with brand CTA/hashtags).
- Publish page: "Generate captions" button (`<RequiresAI need="llm">`, action uses
  `requireAIKeys`). On schedule/copy, edited captions log `edit_events` op `caption_edit`.

## Phase 4: Home
- Actions: Generate clips (/queue), Recommended long-form videos (sheet with region field).
- Charts (hand-built SVG/CSS bars, no new dependency): views over time, posts per week, top
  clips, score distribution; empty states. Insight cards from `change_log`. Rating nudge for
  7d scores > 1.5 or < 0.6 (1-5 stars + note on `post_metrics`).
- Recommendations: `$lib/server/youtube-search.ts` (search CC + long, trending by region; fake
  via fixtures when `YOUTUBE_FAKE=true`), LLM (task `recommendations`) picks 3-4 with reasons.

## Seed + docs
- `pnpm seed:performance` / `:clean` (tag `seed:performance`): job, clips with features, posted
  posts, baseline seeds, metrics, one post with pending checkpoints for run-now.
- docs/performance.md (new, INDEX append), brand-memory.md one appended subsection,
  data-model/env/publishing small appends. Handoff at plans/handoff-performance.md.
