---
covers:
  - supabase/migrations
  - apps/web/src/lib/server/youtube.ts
  - apps/web/src/lib/features/platform-connections
  - apps/web/src/lib/entities/post
  - apps/web/src/routes/(authed)/(shell)/settings/youtube
  - apps/worker/seed_publish.py
last_updated: 2026-11-01
---
# Publishing, scheduler, performance

## YouTube connect (separate from login)
- Own Google OAuth client (`YOUTUBE_CLIENT_ID/SECRET`), not Supabase Auth. Code:
  `apps/web/src/lib/server/youtube.ts`.
- Scopes (checked 2026-10-31): `https://www.googleapis.com/auth/youtube.upload`,
  `.../youtube.readonly`, `.../yt-analytics.readonly` (plan 9 baseline seeding; asked now so there
  is no second consent). `access_type=offline`, `prompt=consent` → always a refresh token.
- Flow: Settings "Connect" → `GET /settings/youtube/connect` (random `state` in an httpOnly
  `yt_oauth_state` cookie, 10 min) → Google → `GET /settings/youtube/callback` (state must match)
  → code exchange at `oauth2.googleapis.com/token` → `channels.list?part=snippet&mine=true` →
  refresh token encrypted (`ENCRYPTION_KEY`, same AES-GCM format as BYOK keys) → upsert
  `platform_connections` (channel_id, account_name, avatar_url) with the secret-key client →
  `/settings?youtube=connected|denied|missing_scopes|no_channel|error`.
- Redirect URI = `YOUTUBE_REDIRECT_URI`, or `<origin>/settings/youtube/callback` when unset. It
  must be listed on the OAuth client in Google Cloud (local + `https://clip-studio-pi.vercel.app`).
- Disconnect (Settings action `disconnect`): POST `oauth2.googleapis.com/revoke` (best effort)
  then delete the row.
- Settings → "Connected platforms" (`$lib/features/platform-connections`): YouTube
  connect/disconnect with channel avatar + name; Instagram, LinkedIn, X "Coming soon".
- While the Google app is unverified, uploads are posted **private** (`privacyStatus: private`).

## Seed
`pnpm seed:publish` (`apps/worker/seed_publish.py`): for the dev-login user (`SEED_EMAIL`, default
`dev@clip-studio.test`; sign in once first) creates a `jobs` row titled `seed:publish`, 3 clips with
descriptions, and 1080x1920 20s ffmpeg test videos at `renders/{clip_id}.mp4` (`render_path` set).
Idempotent (cleans then recreates). `pnpm seed:publish:clean` deletes those R2 objects and the job
(clips and posts cascade).

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
