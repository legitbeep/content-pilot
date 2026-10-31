---
covers:
  - supabase/migrations
last_updated: 2026-10-31
---
# Publishing, scheduler, performance

Not built yet.

## YouTube connect (separate from login)
- Own Google OAuth client (`YOUTUBE_CLIENT_ID/SECRET`), not Supabase Auth.
- Scopes: `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly` (baseline seeding).
  `access_type=offline`, `prompt=consent` to get a refresh token.
- Callback route (planned): `/settings/youtube/callback` → encrypt refresh token
  (`APP_ENCRYPTION_KEY`) → upsert `platform_connections`.
- While the Google app is unverified, uploads are posted **private** (`privacyStatus: private`).

## Captions
Generated per platform (youtube, instagram, linkedin, x) → one `posts` row each. Only youtube
auto-posts; others are copy-only in the UI (`status` stays `draft`).

## Scheduler loop (worker)
Each tick: `posts` where `status='scheduled' and scheduled_at <= now()` (use `FOR UPDATE SKIP
LOCKED`) → upload rendered clip → set `posted`, `posted_at`, `external_id`, or `failed` + `error`.

## Checkpoints
At 48h, 7d, 14d, 30d after `posted_at`: fetch stats → insert `post_metrics`
(unique `(post_id, checkpoint)` makes it idempotent).

## Baseline and score
- **Samples** per checkpoint = the creator's own `post_metrics` rows ∪ `baseline_seeds` rows at
  that checkpoint, newest 20 by publish time (seeds age out as real posts arrive).
- **Baseline** = median views of those samples. **Minimum 5 samples per checkpoint.**
- `score = views / baseline`; 1.0 = typical.
- Below 5 samples: still store `post_metrics.views`, leave `score` null, UI shows
  **"Not enough data yet"**, and skip verdicts (no high/low labels, no pattern → rule proposals).

## Baseline seeding (on YouTube connect)
Job run once by the worker after `platform_connections` is created (idempotent via the unique key):
1. `channels.list(mine=true, part=contentDetails)` → uploads playlist →
   `playlistItems.list` → the channel's last 20 videos (`videoId`, `publishedAt`).
2. Per video, YouTube Analytics `reports.query(ids=channel==MINE, metrics=views, dimensions=day,
   filters=video==<id>, startDate=publishedAt, endDate=publishedAt+30d)` → cumulative views at
   day 2 / 7 / 14 / 30 → one `baseline_seeds` row per checkpoint the video has fully reached.
3. Videos younger than a checkpoint (or still inside Analytics' ~2-3 day reporting lag) get no
   row for it. A channel with < 5 videos simply stays at "Not enough data yet".

## Patterns → proposed rules
Repeated traits among high- or low-scoring posts → `proposed` learned rules (`docs/brand-memory.md`).
