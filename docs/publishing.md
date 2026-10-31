---
covers:
  - supabase/migrations
  - apps/web/src/lib/server/youtube.ts
  - apps/web/src/lib/features/platform-connections
  - apps/web/src/lib/entities/post
  - apps/web/src/routes/(authed)/(shell)/settings/youtube
  - apps/worker/seed_publish.py
  - apps/worker/loops/publisher.py
  - apps/worker/worker/youtube.py
  - apps/web/src/lib/server/publishing
  - apps/web/src/lib/features/publish-clip
  - apps/web/src/routes/(authed)/(shell)/publish
  - apps/web/src/routes/(authed)/(shell)/calendar
  - apps/web/src/lib/widgets/post-calendar
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
  `/settings?youtube=connected|denied|missing_scopes|no_channel|error`. Onboarding's optional
  step starts with `?next=/onboarding` (kept in a `yt_oauth_next` cookie; only `/onboarding` or
  `/settings` are allowed) and gets the same flag back on `/onboarding`.
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
(clips and posts cascade). It also inserts a **fake** YouTube connection (`account_name =
`seed:publish`) when the user has none, so `/publish` works without real OAuth; posting with it
fails at token refresh (no real upload). Clean removes it.

## Captions
`$lib/server/publishing/captions.ts`: `CaptionGenerator.generate(clip, platform, brand)` →
`{ title, description, tags }`. Today `templateCaptions`: title = first sentence of the clip
description (≤ 100 chars, `<`/`>` stripped since YouTube rejects them), description = clip
description + CTA (default "Follow for more.") + hashtags (default `#shorts #creator`), tags =
hashtags without `#`. X is cut to 280 chars. `brand` (`{cta?, hashtags?}`) is passed as null until
brand memory feeds it. Plan 9: the publish page passes the brand's `default_cta` + `default_hashtags`, and LLM copy is generated on page load and swapped in for every platform (`docs/performance.md`).

## Publish page (`/publish`)
- Lists clips with `render_path` and no YouTube post in `scheduled|publishing|posted` (RLS).
  Preview = presigned R2 GET (`presignGet`). Form: `$lib/features/publish-clip`.
- Platform toggles: YouTube posts (disabled until connected); Instagram, LinkedIn, X are
  "Copy only" (caption + Copy button, **no `posts` row**).
- YouTube: title, description, tags (comma separated) prefilled from the captions; **Post now**
  (= `scheduled_at` now) or **Schedule** (`datetime-local` in the browser's time zone → UTC ISO
  before submit). Action `schedule` validates (title 1-100, description ≤ 5000, time not in the
  past, ≤ 180 days ahead, connected, rendered, no live post) and inserts `posts`
  (`status = scheduled`). Note on the page: uploads are private while the app is unverified.

## Publisher loop (worker, `apps/worker/loops/publisher.py`)
Started from `main.py` (one line, own thread). Every 60s `tick()` claims due posts one at a time:
`update posts set status='publishing', attempts+1 … where id = (select … where status='scheduled'
and platform='youtube' and scheduled_at <= now() order by scheduled_at for update skip locked
limit 1)`. Per post (`publish`), always scoped by `user_id`:
1. Load `clips.render_path` and the `platform_connections` row; decrypt the refresh token.
2. `worker/youtube.py` `access_token()` (refresh grant at `oauth2.googleapis.com/token`). Every
   request there sends `User-Agent: clip-studio-worker/1.0` (see `llm.md`).
3. Download the render from R2 to a temp dir, ffprobe it. **Shorts**: YouTube classifies a
   video as a Short when it is vertical or square and ≤ 3 minutes (since 2024-10-15; no API flag).
   Those get `#Shorts` appended to the description (if absent) and a `youtube.com/shorts/<id>` URL.
4. Resumable upload (`uploadType=resumable`, `part=snippet,status`, `privacyStatus: private`):
   init POST → `Location` → one PUT of the file.
5. Success → `posted`, `posted_at`, `external_id`, `external_url`, `error = null`.

Failures (`error` is user-readable; details go to the worker log):
- `invalid_grant` / 401 (token revoked or expired) → `failed`, "YouTube access expired.
  Reconnect in Settings." No retry.
- Not retryable (quota, no channel, 400/403, `invalid_client`) → `failed` with that message.
- Anything else → back to `scheduled` with `scheduled_at = now() + 1/2/4 min` and an
  "attempt n of 3" note; after 3 attempts → `failed`, "… Retry from the calendar."
- No render / no connection → `failed` with a matching message.

Run one: `python -m worker.run_once post <id>` claims that scheduled post even if not yet due.

## Calendar (`/calendar`)
`ssr = false` (`+page.ts`): every date is rendered and filtered in the browser's time zone.
Load = all of the user's non-draft posts + presigned previews (`depends('app:posts')`); filtering
is client side (`$lib/widgets/post-calendar/calendar.ts`, tested).
- URL state: `view=table` (default month), `month=YYYY-MM`, `platform`, `status`, `from`, `to`
  (inclusive local days). Changes use `goto(..., { replaceState })`.
- Month view: Monday-first grid; per day a dot per post coloured by status (`statusDot` in
  `entities/post`); click a day → popover list → details. A post sits on `posted_at ?? scheduled_at`.
- Table view: `DataTable` with thumbnail, title, platform, date/time, status, "View details".
- Details dialog: preview, title, full caption, tags, platform, time, status, error. Actions by
  status (`canPost`): scheduled → edit caption, reschedule, cancel; failed → retry, reschedule,
  cancel; cancelled → reschedule; posted → open on YouTube; publishing → none.
- Page actions `reschedule | edit | cancel | retry` update with a status filter
  (`.in('status', allowed)`) so they can't race the worker's claim; rescheduling a
  failed/cancelled post checks there's no other live post for the clip. Reschedule and retry reset
  `attempts` and `error`.

## Checkpoints
At 48h, 7d, 14d, 30d after `posted_at`: fetch stats → insert `post_metrics`
(unique `(post_id, checkpoint)` makes it idempotent). Built in plan 9: `docs/performance.md`.

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
