# Handoff: plan 9 (performance), branch feat/performance

Commits: 95cf24e (phases 1-2), 51fb18b (phase 3), ff365ee (phase 4), + this note.
`pnpm check` and `pnpm test` pass (web 104, schema 11, worker 114). Full reference: `docs/performance.md`.

## Built
- **Checkpoints** 48h / 7d / 14d / 30d (14d kept: free, the enum already had it). Trigger
  `posts_create_checkpoints` creates `post_checkpoints` rows when a post becomes `posted`, so
  plan 8's publisher wasn't touched.
- **Worker loop** `apps/worker/loops/checkpoints.py` (one line in `main.py`): seeds baselines for
  new connections, processes due checkpoints (SKIP LOCKED) → `post_metrics` (views, likes,
  comments, avg_view_pct, score, verdict) → learning. Never run long-lived. run_once kinds:
  `checkpoint <post_id>` (the post's next undone checkpoint, now), `baseline <user_id>`.
- **YouTube read client** `worker/yt_stats.py`. Never called for real: `YOUTUBE_FAKE=true` reads
  recorded fixtures (`apps/worker/tests/fixtures/youtube/`). Docs checked: Analytics supports
  per-video daily views (`dimensions=day`, `filters=video==ID`), so baselines are reconstructed
  at day 2/7/14/30. If Analytics fails, it falls back to total views (`baseline_method`).
- **Score/verdict/learning/ranking** `apps/worker/ranking.py`: score = views / median of the
  newest 20 samples (< 5 → null, insufficient_data). Verdict at 7d (provisional) and 30d (final),
  > 1.5 boost, < 0.6 downgrade. feature_weights = moving average (last 10). change_log entries
  when a feature enters a band. Candidate rules after 3 same-verdict posts.
  `apply_weights(user_id, candidates)` matches the STATUS signature. Multiplier is clamped
  0.5-2. Every 7th slot from index 2 (~15%) is a random exploration pick (`explore: true`).
- **LLM captions** (`$lib/server/publishing/llm-captions.ts`, task `captions`,
  `buildMemoryContext(..., {scope:'copy'})` unchanged): one call for all 4 platforms, limits
  enforced. The publish page gets a "Generate captions" button (RequiresAI). Template prefill now
  uses the brand's CTA and hashtags. Copy-only captions can be edited.
- **Caption edits** → `edit_events` `op='caption_edit', source='manual', clip_id,
  args={platform, before, after}` (YouTube on Post/Schedule, the others on Copy). There is no op
  CHECK constraint, so no migration was needed.
- **Home**: Generate clips (primary) + Recommended long-form videos (sheet, region, task
  `recommendations`, CC + long search, trending signal). Hand-built `BarChart` charts (views over
  time, posts per week, top clips, score distribution). "What we learned" cards from change_log.
  Rating nudge (1-5 + note on the 7d metric).

## Contracts
- Implements `apply_weights` per STATUS. **At merge, take this branch's `apps/worker/ranking.py`.**
- brand_rules: only `status='candidate', source='performance', scope='clip_selection'`. Evidence
  items are `{kind:'performance', post_id, feature, verdict}`. Dedupe is on
  evidence[0].feature + verdict; rows that are accepted, pinned or archived are never touched.
  Never sets active.
- Rule text is a template, not the LLM `learn_rules` task. The worker would need user keys, and
  a template is deterministic. Swap it in later if wording matters.
- No new LLM tasks (captions and recommendations already existed). Registry untouched.

## Adapter fixes
None.

## Migrations
`supabase/migrations/20261101150000_p9_performance.sql`. Applied to the shared DB with psql
twice (idempotent). It adds:
- `post_checkpoints` and its trigger
- `feature_weights`, `change_log`
- new `post_metrics` columns: avg_view_pct, verdict, rating, rating_note
- nullable `platform_connections.baselines_seeded_at` and `baseline_method` (plan 8's table)
- `clips.features` / `ranking_score` (`add column if not exists`). Plan 5's columns, already
  on the DB, so this is a no-op there.

## Shared files touched (append-only)
- worker `main.py` (1 line), `worker/run_once.py` (2 kinds), root `package.json` (3 scripts)
- `docs/INDEX.md`, `docs/data-model.md`, `docs/env.md`, `docs/publishing.md` (2 sentences),
  `docs/brand-memory.md` (one appended subsection only), `docs/product/pages.md` (Home + publish
  rows), `docs/design/design-system.md` (BarChart row)
- both `.env.example` files (`YOUTUBE_FAKE`)
- Wave-1 code:
  - `$lib/server/youtube.ts`: `baselines_seeded_at: null` in the connect upsert, so it reseeds
  - the publish route and `publish-form.svelte`

## Seed
- `pnpm seed:performance` (user `dev-perf@clip-studio.test`; sign in once via dev login first).
  It creates a fake connection, 80 baseline values, 9 scored posts, learning (11 weights,
  6 change_log entries, 6 candidate rules), and 1 pending post. It prints the
  `pnpm checkpoints:run-now <post_id>` line for that post.
- `pnpm seed:performance:clean` removes it. It also clears dev-perf's derived feature_weights
  and change_log.
- Seed state now: seeded, with one 7d rating saved from the browser test.

## Needs human
1. **Real Analytics/Data API check**:
   - Set `YOUTUBE_CLIENT_SECRET` on main and remove `YOUTUBE_FAKE`.
   - Settings → Connect YouTube with a channel that has 5+ videos older than ~33 days.
   - Run `pnpm worker:once baseline <your user_id>`.
   - Expected: "seeded N baseline values from 20 videos (analytics)", and `baseline_seeds` rows
     for checkpoints 48h/7d/14d/30d. If it says `total_views`, Analytics failed (check the
     scope or that the API is enabled in Google Cloud).
2. **Real checkpoint**:
   - Post a clip, then run `uv run --directory apps/worker --env-file .env python -m
     worker.run_once checkpoint <post_id>` without YOUTUBE_FAKE.
   - Expected: `48h views=<real> score=…` (or `insufficient_data`), plus a `post_metrics` row.
3. **LLM captions with a real key**:
   - Add a key in Settings and open /publish on a rendered clip.
   - Click Generate captions.
   - Expected: different copy per platform. The YouTube title is ≤ 100 chars, X is ≤ 280,
     banned words are absent, and the brand CTA/hashtags appear.
   - Edit the YouTube title and click Post now.
   - Expected: an `edit_events` row `op=caption_edit`.
4. **Recommendations with a real key and connection**:
   - On Home, click Recommended long-form videos, enter region `IN`, and click Find videos.
   - Expected: 3-4 Creative Commons long videos with reasons and "Open on YouTube".
5. **Home visual check** as dev-perf after seeding:
   - Expected: 2 rating nudges, 6 insight cards, 4 charts.
   - Rate one with 4 stars and click Save rating: a toast appears and that nudge disappears.

## Risks
- `YOUTUBE_FAKE` must never be set in production. It is only read in yt_stats and
  recommendations, and is documented as dev only.
- The fake transport reads `apps/worker/tests/fixtures`. The worker Docker image doesn't need
  it unless fake is on.
- Weights, rules and change_log are produced only from verdicts. 48h/14d metrics are stored but
  never learned from.
- The total_views fallback overstates early-checkpoint baselines.
- `apply_weights` exploration reorders even with no weights (by design, ~15%). If plan 5 shows
  only the top N, exploration picks show up there.
- Ratings are stored but don't change weights yet.
- Charts are hand-built instead of the shadcn chart component (avoids adding layerchart/d3).
