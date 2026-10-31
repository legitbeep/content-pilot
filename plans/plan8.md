# Plan 8: YouTube connect, publish, scheduler, calendar

Wave 1 (parallel with plans 4 and 6). Branch `feat/publish`, dev port 5175.
Read plans/parallel-rules.md, CLAUDE.md, docs/INDEX.md, then only: publishing,
auth-and-keys, data-model, env, design-system. Plan mode first. Commit per phase.

## Phase 1: Seed + YouTube connect

1. `pnpm seed:publish`: 3 rendered clips (ffmpeg test videos at
   `renders/{clip_id}.mp4`, `render_path` set; add `render_path` and `render_status`
   as nullable columns if plan 6's migration isn't there) with descriptions.
   Plus `seed:publish:clean`.
2. YouTube OAuth, separate from login (YOUTUBE_CLIENT_ID / SECRET / REDIRECT_URI).
   Scopes: upload, read-only, and YouTube Analytics read-only (plan 9 needs it;
   requesting now avoids a second consent). Offline access with consent prompt.
   Verify scope names in Google's current docs.
3. Store the refresh token encrypted in `platform_connections` with channel id, name
   and avatar. Disconnect revokes the token and deletes the row.
4. Settings -> "Connected platforms": YouTube connect/disconnect; Instagram,
   LinkedIn and X listed as "Coming soon".

## Phase 2: Publish + scheduler

1. `posts`: id, clip_id, user_id, platform, status
   (scheduled | publishing | posted | failed | cancelled), scheduled_at (UTC),
   posted_at, external_id, external_url, title, caption, tags, error, attempts.
2. `/publish`: rendered clips not yet posted. Per clip: preview, platform toggles
   (YouTube posts; Instagram, LinkedIn, X are "Copy only" with a copy button), title,
   description and tags prefilled, "Post now" or "Schedule" (date-time in the user's
   time zone).
3. Captions go through a `CaptionGenerator` interface
   (lib/server/publishing/captions.ts) with `generate(clip, platform, brand)`.
   Implement a template version now (title from the hook, description + default CTA
   + default hashtags). Plan 9 swaps in the LLM version.
4. A note on the page: while the Google project is unverified, YouTube uploads are
   private.
5. Worker publisher loop (loops/publisher.py), every 60s: claim due posts with SKIP
   LOCKED, refresh the access token, resumable upload with title/description/tags,
   store external id/url, mark posted. Vertical clips of Shorts length are tagged
   for Shorts (verify current rules). Retry with backoff up to 3 times, then
   `failed` with a readable error ("YouTube access expired. Reconnect in Settings.").

## Phase 3: Calendar (`/calendar`)

1. Month view: dots per day coloured by status; click a day -> popover list.
2. Toggle to Table view (DataTable): thumbnail, title, platform, date/time, status,
   "View details". Filters: platform, status, date range. View and filters live in
   the URL.
3. Details modal: preview, full caption, platform, time, status. Actions depend on
   status: reschedule, edit caption (scheduled), cancel, retry (failed), open on
   YouTube (posted).

## Acceptance

- pnpm check and pnpm test pass.
- Connect YouTube; schedule a seed clip 3 minutes ahead; the worker posts it on time;
  status becomes posted; the video appears (private) in YouTube Studio.
- Revoking access in the Google account makes the next post fail with the reconnect
  message.
- Calendar and table views show the same posts; filters work.
- Handoff note written.
