---
covers:
  - apps/worker/loops/checkpoints.py
  - apps/worker/ranking.py
  - apps/worker/worker/yt_stats.py
  - apps/worker/seeds/performance.py
  - apps/worker/tests/fixtures/youtube
  - supabase/migrations/20261101150000_p9_performance.sql
  - apps/web/src/lib/server/publishing/llm-captions.ts
last_updated: 2026-11-01
---
# Performance loop, ranking, captions, Home

Plan 9. Posted clips are measured at checkpoints, scored against the creator's own baseline, and
the results re-rank future clip candidates and propose brand rules (never adopt them).

## Tables (migration `p9_performance`)
| Table / column | Notes |
|---|---|
| `post_checkpoints` | post_id, checkpoint, due_at, claimed_at, attempts, done_at, error. unique (post_id, checkpoint). Created by trigger `posts_create_checkpoints` when a post is inserted/updated as `posted` with `posted_at`: 48h, 7d, 14d, 30d after it. Own RLS |
| `post_metrics` + | `avg_view_pct`, `verdict` (boost\|neutral\|downgrade, 7d/30d only), `rating` 1-5, `rating_note` (Home rating nudge) |
| `platform_connections` + | `baselines_seeded_at` (null = seed on next tick; `connectYoutube` resets it), `baseline_method` (analytics\|total_views\|failed) |
| `feature_weights` | (user_id, feature) pk, weight, samples. Feature keys `topic:<x>`, `length:<short\|medium\|long>`, `hook:<type>`. Own RLS |
| `change_log` | kind (weight\|rule), feature, message, data. Home insight cards. Own RLS |
| `baseline_seeds` | (existing) the "baselines": per-checkpoint views of the channel's videos before Clip Studio |
| `clips.features`, `clips.ranking_score` | plan 5's columns (`{topic, length_bucket, hook_type}`), repeated `if not exists` |

## YouTube read client (`worker/yt_stats.py`)
Plain urllib through `youtube._send` (same UA + error mapping as uploads).
- `recent_uploads(token)`: `channels.list(part=contentDetails, mine=true)` → uploads playlist →
  `playlistItems.list(maxResults=20)` → `[{video_id, published_at}]`.
- `daily_views(token, id, start, end)`: Analytics `reports.query(ids=channel==MINE, metrics=views,
  dimensions=day, filters=video==<id>)`.
- `video_stats(token, ids)`: Data API `videos.list(part=statistics)` → views, likes, comments
  (real time). `avg_view_pct`: Analytics `metrics=averageViewPercentage, filters=video==<id>`.
- **Verified 2026-11-01** (developers.google.com/youtube/analytics/channel_reports): the
  time-based "User activity" channel report allows `dimensions=day` with a `video==ID` filter and
  `views`, so per-video daily views (and so views at day 2/7/14/30) can be reconstructed. The
  "Basic user activity statistics" report (no dimensions) allows `averageViewPercentage` with a
  `video` filter. Data lags ~2-3 days.
- **Never called for real in dev/tests.** `YOUTUBE_FAKE=true` answers from the recorded responses
  in `apps/worker/tests/fixtures/youtube/` (shaped like the real API: `channelListResponse`,
  `playlistItemListResponse`, `videoListResponse`, `youtubeAnalytics#resultTable`), scaled per
  video id so fake videos differ deterministically. Tests set it or monkeypatch functions.

## Baselines (on YouTube connect)
The checkpoints loop seeds every connection with `baselines_seeded_at is null`
(`seed_baselines(user_id)`, also `python -m worker.run_once baseline <user_id>`):
last 20 uploads → per video and reached checkpoint (published + N days + 3 days lag ≤ today) the
sum of its first N days of daily views → `baseline_seeds` (upsert). If Analytics fails
(scope/API off), fallback = current total views for every reached checkpoint
(`baseline_method = total_views`, overstates early checkpoints). Any other failure →
`failed` (no retry until reconnect).

## Checkpoints loop (`loops/checkpoints.py`)
Registered in `main.py` (one line, own thread), every 5 min: seed pending baselines, then claim
due checkpoints one at a time (`for update skip locked`; a claim older than 10 min can be
re-claimed). Per checkpoint: load the post (must be `posted` with `external_id`) → token →
`video_stats` (+ `avg_view_pct`, optional) → samples → score → verdict → upsert `post_metrics`
→ `done_at`. Errors: reconnect/YouTube errors keep the checkpoint open (retry after the claim
expires) up to 5 attempts, then `done_at` + `error`. A post that isn't live or a deleted video
finishes with an error.

Dev/test: `pnpm checkpoints:run-now <post_id>` (= `YOUTUBE_FAKE=true python -m worker.run_once
checkpoint <post_id>`) processes that post's next undone checkpoint now, ignoring `due_at`.
Prints e.g. `7d views=3393 score=2.003 verdict=boost`.

## Score and verdict (`ranking.py`)
- Samples per checkpoint = the user's other `post_metrics` ∪ `baseline_seeds`, newest 20 by publish
  time. Fewer than 5 → `score = null` ("insufficient_data", "Not enough data yet"), no verdict.
- `score = views / median(samples)`.
- Verdict at 7d (provisional) and 30d (final): `boost` > 1.5, `downgrade` < 0.6, else `neutral`.
  48h/14d get a score but no verdict.

## Learning (after every verdict)
`learn(user_id)` recomputes from all scored posts (each post counts once, with its latest
verdict: 30d replaces 7d):
- `feature_weights[f]` = simple moving average of the last 10 scores of posts with feature `f`.
- A weight entering the boost (> 1.5) or downgrade (< 0.6) band with 2+ posts → `change_log`
  `weight` entry, e.g. "Short clips (30s or less) got 2.3x your usual views. Ranking them higher."
- Same feature + same verdict (boost/downgrade) on 3+ posts → `brand_rules` row
  `source=performance, status=candidate, scope=clip_selection`, rule text from a template
  ("Favour clips about hygiene: 3 posts got 2.6x your usual views."), `evidence` items
  `{kind:'performance', post_id, feature, verdict}`, `evidence_count` = items, plus a `change_log`
  `rule` entry. Dedupe: an existing candidate with the same `evidence[0].feature` + verdict gets
  the new posts appended; if that rule was accepted, pinned or archived it is left alone. Never
  sets `active` (plan 7's review on /brand promotes). See `docs/brand-memory.md`.

## Ranking: `apply_weights(user_id, candidates)` (`ranking.py`)
Called by extract_clips (plan 5). Each candidate has `scores` (dict/list of numbers) and
`features`. `ranking_score = mean(scores) × Π clamp(weight[f], 0.5, 2.0)` (unknown features = 1).
Returns the candidates ordered by it, except every 7th slot starting at index 2 (2, 9, 16, …,
~15%) is an exploration pick: a random remaining candidate regardless of weights, marked
`explore: true`. Weights load from `feature_weights` unless passed (tests).

## Seed
`pnpm seed:performance` (user `SEED_EMAIL`, default `dev-perf@clip-studio.test`; sign in once via
dev login): fake connection (`account_name = seed:performance`), baselines from the fixtures,
job `seed:performance` with 9 posted clips and metrics at every checkpoint (hygiene/short/question
~2-3x, money/long/story ~0.4x), `learn` run (weights, 6 change_log entries, 6 candidate rules), and
1 post posted 8 days ago with open checkpoints; the command prints its `checkpoints:run-now` line.
`pnpm seed:performance:clean` removes exactly that (plus the seed user's derived
feature_weights/change_log).

## LLM captions (`$lib/server/publishing/llm-captions.ts`)
`generateCaptions(supabase, userId, clip)`: ONE `generateJSON` call (task `captions`, fast tier)
with `buildMemoryContext(profile, rules, { scope: 'copy' })` (unchanged, plan 4's), the clip
description and its words (≤ 4000 chars). Output `{youtube: {title, description, tags},
instagram: {caption, hashtags}, linkedin: {text}, x: {text}}` → `toCaptions` enforces limits
(YouTube title ≤ 100 and no `<>`, tags without `#`, Instagram ≤ 2200 with `#` hashtags, LinkedIn ≤
3000, X ≤ 280) into the form's `{title, description, tags}` per platform.
- Publish page: the template captions (now with the brand's default CTA + hashtags) stay as the
  instant prefill; **Generate captions** (`<RequiresAI need="llm">`, action `captions` →
  `requireAIKeys('llm')`) replaces them. AI errors show as a toast (`aiFail`).
- Copy-only platforms (Instagram, LinkedIn, X) are now editable textareas (X shows n/280).
- **Caption edits → `edit_events`** (contract in plans/STATUS.md): `op = 'caption_edit'`,
  `source = 'manual'`, `clip_id`, `args = {platform, before, after}`, summary "Edited the
  <platform> caption". YouTube: on Post/Schedule, `before` = the prefilled/generated
  `{title, description, tags}`, `after` = what was submitted. Copy-only: on Copy, with
  `{description}`. Nothing is logged when unchanged; a failed insert never blocks posting.
  `edit_events.op` has no CHECK constraint, so no migration was needed.
