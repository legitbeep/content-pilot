# Handoff: publish (plan 8)

Branch `feat/publish`. Commits: phase 1 (seed + connect), phase 2 (publish + publisher loop),
phase 3 (calendar), this handoff. `pnpm check` and `pnpm test` pass.

## Built
- **YouTube connect** (`$lib/server/youtube.ts`, routes `settings/youtube/connect|callback`):
  scopes youtube.upload, youtube.readonly, yt-analytics.readonly; offline + consent; CSRF state
  cookie; refresh token encrypted into `platform_connections` with channel id, name, avatar.
  Disconnect revokes at Google and deletes the row.
- **Settings → Connected platforms** (`$lib/features/platform-connections`): YouTube
  connect/disconnect; Instagram, LinkedIn, X "Coming soon".
- **/publish** (`$lib/features/publish-clip`): rendered clips with no live YouTube post; preview;
  platform toggles (YouTube posts, others copy-only with Copy button); title/description/tags
  prefilled; Post now / Schedule (user's time zone → UTC); unverified-app private note.
- **CaptionGenerator** (`$lib/server/publishing/captions.ts`): interface
  `generate(clip, platform, brand)` + `templateCaptions`. Plan 9 swaps in the LLM version.
- **Publisher loop** (`apps/worker/loops/publisher.py`, `worker/youtube.py`): 60s tick, SKIP LOCKED
  claim, token refresh, resumable upload (private), Shorts tag when vertical/square and ≤ 3 min,
  retry with 1/2/4 min backoff up to 3 attempts, readable errors (revoked token → "YouTube access
  expired. Reconnect in Settings."). One line in `main.py`; `run_once post <id>`.
- **/calendar** (`$lib/widgets/post-calendar`, `ssr = false`): month view with status dots + day
  popover, table view (DataTable), filters platform/status/from/to + view + month in the URL,
  details dialog with reschedule, edit caption, cancel, retry, open on YouTube.
- `$lib/entities/post`: types, platforms, `canPost`, `PostStatusBadge`, `statusDot`.

## Contracts added
- `CaptionGenerator` / `templateCaptions` (above). `brand` is `{cta?, hashtags?} | null`, passed
  null today.
- `posts` row = one YouTube post; copy-only platforms create **no** row (docs said `draft` rows;
  changed in `docs/publishing.md`).
- No new LLM task names; no AI calls in this plan (so no `<RequiresAI>` gates needed).

## Migration
`supabase/migrations/20261101120000_p8_publish.sql` (applied to the shared DB with psql, idempotent):
- `post_status` += `publishing`, `cancelled`.
- `posts` += `title`, `tags text[]`, `external_url`, `attempts`, `updated_at`.
- `platform_connections` += `channel_id`, `avatar_url`; view `platform_connections_public`
  re-created with them appended.
- **Columns on tables I don't own (nullable):** `clips.render_path text`, `clips.render_status text`
  (plan 6), `clips.description text` (plan 5). If plan 6 wants `render_status` as an enum, its
  `add column if not exists` will silently skip because mine already exists: plan 6 should
  `alter column ... type` instead, or reuse text.

## Shared files touched (append-only)
`apps/worker/main.py` (1 import + 1 thread line), `apps/worker/worker/run_once.py` (`post`
handler), `apps/worker/worker/r2.py` (`upload_file`, `download_file`, `delete`),
`apps/web/src/lib/server/r2.ts` (`presignGet`), root `package.json` (seed scripts), Settings page
(new section + `disconnect` action), docs: publishing, data-model, queue, architecture,
product/pages.

## Seed
`pnpm seed:publish` / `pnpm seed:publish:clean` (`apps/worker/seed_publish.py`): dev-login user,
job titled `seed:publish`, 3 clips with descriptions, 1080x1920 20s ffmpeg renders at
`renders/{clip_id}.mp4`, plus a **fake** YouTube connection (`account_name = seed:publish`) only
when the user has none. Seed data is currently in the DB (one scheduled seed post at 19:06 UTC;
with the fake token it can only fail). Run clean before the real connect test, or the fake
connection is replaced on connect anyway (upsert).

## Verified
- Settings section renders; connect redirects to Google with the right scopes/params; bad state
  → `?youtube=denied`.
- Publish: schedule via UI stores correct UTC time; duplicate schedule → 409.
- `run_once post <id>` with the fake connection → `failed` (see risk below).
- Calendar month/popover/details/retry, table view and platform/status filters (browser, dev login).

## Needs human
1. **Google Cloud console** (OAuth client used for `YOUTUBE_CLIENT_ID`): enable *YouTube Data API
   v3* and *YouTube Analytics API*; add authorized redirect URIs
   `https://clip-studio-pi.vercel.app/settings/youtube/callback` and
   `http://localhost:5175/settings/youtube/callback` (plus 5173 if used); on the OAuth consent
   screen add the three scopes and your Google account as a test user.
2. **Env:** set `YOUTUBE_REDIRECT_URI` per environment (web `.env` currently points to port 5173;
   use 5175 for this worktree or unset it to derive from the origin). On Vercel set
   `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`
   (`https://clip-studio-pi.vercel.app/settings/youtube/callback`). The worker needs the same
   client id/secret.
3. **Worker client check:** a token refresh from the worker got `invalid_client` ("The OAuth
   client was not found"). Check that `apps/worker/.env` `YOUTUBE_CLIENT_ID/SECRET` are the real
   client and match the web ones.
4. **Acceptance run:** `pnpm seed:publish:clean && pnpm seed:publish`; in Settings click Connect
   and consent; on /publish schedule a seed clip 3 min ahead; run
   `cd apps/worker && set -a && . ./.env && set +a && uv run python -m worker.run_once post <id>`
   (or the worker) after it's due; check status posted + private video in YouTube Studio. Then
   revoke the app at myaccount.google.com/permissions, schedule another and confirm it fails with
   "YouTube access expired. Reconnect in Settings."

## Known gaps / risks
- Not tested against real YouTube (no valid client/consent): upload request shape follows the
  docs and is unit-tested with fakes only.
- Uploads read the whole file into memory in one PUT (`ponytail:` note); fine for short clips.
- Calendar loads all of a user's posts and filters in the browser; page by month if it grows.
- Captions don't use brand memory yet (`brand = null`).
- Data API quota: an upload costs ~1600 units of the default 10,000/day (~6 uploads/day).
