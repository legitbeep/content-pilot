# Work plan: publish (plan 8)

Branch `feat/publish`, dev port 5175. No AI calls in this plan (captions are a template), so
no `<RequiresAI>` gates and no new LLM task names.

## Phase 1: seed + YouTube connect
- Migration `supabase/migrations/20261101120000_p8_publish.sql` (idempotent, additive):
  - `post_status` += `publishing`, `cancelled`.
  - `posts` += `title`, `tags text[]`, `external_url`, `attempts`, `updated_at`; index on due posts.
  - `platform_connections` += `channel_id`, `avatar_url`; `platform_connections_public` view
    re-created with them appended.
  - `clips` += nullable `render_path`, `render_status` (plan 6 owns), `description` (plan 5 owns).
- Seed: `apps/worker/seed_publish.py` (`pnpm seed:publish` / `seed:publish:clean`). Dev-login
  user, one `jobs` row titled `seed:publish`, 3 clips with descriptions, ffmpeg 1080x1920 20s
  videos uploaded to `renders/{clip_id}.mp4`. Clean = delete those R2 objects + the job (cascade).
- Web `$lib/server/youtube.ts`: auth URL (scopes youtube.upload, youtube.readonly,
  yt-analytics.readonly; offline + consent; state cookie), code exchange, channel info, revoke.
- Routes `settings/youtube/connect` (GET → Google) and `settings/youtube/callback` (GET →
  encrypt refresh token → upsert `platform_connections` via admin client → /settings).
  Settings action `disconnect` revokes + deletes the row.
- Settings "Connected platforms": YouTube row; Instagram/LinkedIn/X "Coming soon".

## Phase 2: publish + scheduler
- `$lib/entities/post`: types, statuses, `canPost(status, action)` + test, `PostStatusBadge`.
- `$lib/server/publishing/captions.ts`: `CaptionGenerator` interface + `templateCaptions`
  (+ test).
- `/publish`: rendered clips with no live youtube post; presigned preview; platform toggles;
  copy-only platforms with copy button; title/description/tags; Post now / Schedule
  (datetime-local → UTC ISO in the browser). Unverified-app note. Requires connection.
- Worker: `worker/youtube.py` (refresh, resumable upload), `loops/publisher.py` (claim with SKIP
  LOCKED, Shorts tag when vertical/square and <= 180s, retry with backoff x3, readable
  errors), one line in `main.py`, `post` branch in `run_once`. Unit tests with fakes.

## Phase 3: calendar
- `/calendar`: month grid with status dots + popover per day; Table view (DataTable);
  filters platform/status/from/to; `view`, `month`, filters in URL.
- Details dialog: preview, caption, platform, time, status; actions reschedule, edit caption,
  cancel, retry, open on YouTube (page actions, gated by `canPost`).

## Docs
publishing.md, data-model.md, env.md (no new vars expected), product/pages.md if it covers the
routes, handoff.
