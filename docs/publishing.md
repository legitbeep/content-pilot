---
covers:
  - supabase/migrations
last_updated: 2026-10-31
---
# Publishing, scheduler, performance

Not built yet.

## YouTube connect (separate from login)
- Own Google OAuth client (`YOUTUBE_CLIENT_ID/SECRET`), not Supabase Auth.
- Scopes: `youtube.upload`, `youtube.readonly`. `access_type=offline`, `prompt=consent` to get a
  refresh token.
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

## Score
`score = views / median(views of the creator's posts at the same checkpoint)` (the **baseline**).
1.0 = typical. Open: minimum sample size for a baseline (suggest 3 posts; null score below that).

## Patterns → proposed rules
Repeated traits among high- or low-scoring posts → `proposed` learned rules (`docs/brand-memory.md`).
