# Handoff: plan 6 editor (feat/editor)

## Built
- **Timeline schema v2** (breaking, all 5 places): `cropX`, `segments[].sourceKey?` (merge),
  `originalAudio`, `audio[]`, `ducking`, `captions {enabled, style}` (text derived from
  `clips.words`, not stored), `textOverlays`, `blurRegions`. No v1 rows existed, so nothing to migrate.
  `captionChunks` (TS) / `caption_chunks` (Py) share `fixtures/captions.json`. `newTimeline()` helper.
- **Ops** in `$lib/entities/timeline`: `opCatalog` (name, description, zod args, destructive, apply),
  `applyOp(timeline, name, args) -> {timeline, summary}`, throws `OpError`. Undo/redo `history.ts`.
- **Editor** `/editor/[clipId]`: session clips + render status, preview (segments, audio sync,
  captions/text/blur, CSS crop), tracks with yellow playhead + marks, properties panel, agent
  chat slot (`data-slot="agent-chat"`, empty), autosave (800ms, compare-and-set on revision),
  undo/redo, uploads (voiceover/music/video) via presigned PUT, keyboard shortcuts.
- **Render**: `apps/worker/loops/render.py` (SKIP LOCKED claim, `renders/{clip_id}.mp4`),
  pure `worker/render.py` (ffmpeg graph + ASS). Save = render; "Finish all clips" = render the
  session + live summary dialog with previews and a link to `/publish`.
- Golden tests render every valid fixture (duration, resolution, audio checked with ffprobe).

## Operation catalog (plan 7 exposes these as tools)
trim `{segment,start?,end?}` · split `{at}` · delete_range `{start,end}` (destructive) · reorder
`{from,to}` · merge_clip `{sourceKey,start,end,at?}` · mute_track `{track,muted}` · set_volume
`{track,volume}` · add_audio `{kind,key,start?,volume?}` · remove_audio `{track}` (destructive) ·
set_ducking `{enabled}` · set_aspect `{aspect}` · set_crop_offset `{x}` · blur_region
`{start,end,x,y,w,h}` · add_text_overlay `{start,end,text,position?}` · toggle_captions `{enabled}`
· set_caption_style `{font?,color?,position?,size?,wordsPerChunk?}`. Full table: docs/timeline.md.
Agent ops in the UI: `EditorState.apply(op, args, 'agent')` (same history + edit_events).

## Contracts added/changed
- Timeline JSON v2 (above). Pipeline (plan 5) must create initial timelines in v2 shape
  (`newTimeline` in TS; same shape as `seeds/editor.py` `timeline()` in Python).
- `edit_events` rows: `{clip_id, op, args, summary, source: manual|agent}`; undo/redo logged as op `undo`/`redo`.
- `clips.render_status` is **text + CHECK** (`queued|rendering|done|failed`, null = never rendered),
  matching plan 8's text column. Also `render_path`, `render_error`, `render_requested_at`, `rendered_at`.
  Verified live with psql. Worker also writes `timelines.rendered_key/rendered_revision`.
- 16:9 renders 1920x1080 (as docs/timeline.md says), not "1080 wide".
- No LLM task names added. LLM adapter untouched.

## Migrations
`supabase/migrations/20261101130000_p6_editor.sql` (applied to the shared DB twice, idempotent).

## Shared files touched (small, additive)
root `package.json` (seed scripts), `apps/web/package.json` (timeline-schema dep), `shortcuts.ts`
(editor entries, `editorKeys`, `comboOf`; `queueKeys` now filters page `/queue`), `app-shell.svelte`
(main goes full width when the page has `data-full-width`), `$lib/server/r2.ts` (`presignGet`),
`worker/r2.py` (`upload_file`, `delete`), `main.py` (render thread: 1 import + 1 line),
`run_once.py` (`render` kind), docs: agent.md (tools now point to the catalog), architecture,
data-model, design-system, pages, pipeline, queue, timeline; `apps/worker/CLAUDE.md`.

## Seed
`pnpm seed:editor` / `pnpm seed:editor:clean` (dev-login user or `SEED_EMAIL`; job tagged
`jobs.note = 'seed:editor'`; uuid5 ids). Editor: `/editor/285ad98c-0b36-55b6-b916-c616f2c164c0`
for the dev user. Seed voiceover/music are at `uploads/<user_id>/seed-editor/{voiceover,music}.m4a`.

## Verified
Browser (dev login, port 5174): playback + captions, split (S), merge clip 2, mute original,
aspect change, Cmd+Z undo, reload keeps autosaved edits, edit_events rows written, Finish all
dialog polls to done with previews. Docker run_once render of seed clip 1 (trim, split, merged
clip, muted original, voiceover + music with ducking, 9:16, captions): 1080x1920, 20.5s = timeline,
AAC, captions burned (frames checked).

## Needs human
1. **R2 CORS for port 5174** (and 5175 if publish uploads): preflight from `http://localhost:5174`
   returns 403, so browser uploads (Add voiceover/music/video) fail on this port. Cloudflare
   dashboard → R2 → bucket → Settings → CORS policy → add `http://localhost:5174` to
   AllowedOrigins (methods PUT, GET, headers `*`). Then upload an audio file in the editor.
   (Audio tracks were verified by writing them into the timeline directly.)
2. **Docker DNS**: the default container resolver fails here (`docker compose run worker` can't
   resolve Supabase). Workaround used: `docker run --rm --dns 1.1.1.1 --env-file apps/worker/.env
   editor-worker uv run --no-sync python -m worker.run_once render <clip_id>`. Check Docker
   Desktop/colima DNS before `pnpm worker`, or add `dns: [1.1.1.1]` to docker-compose.yml.

## Known gaps
- `pnpm dev -- --port 5174` doesn't forward the port flag (vite got `-- --port`); it landed on
  5174 only because 5173 was busy. Use `pnpm --filter web dev --port 5174`.
- No UI to edit/remove existing text overlays or blur regions (undo covers mistakes; agent can add).
- Audio track start can't be dragged; set at add time (voiceover = playhead, music = 0).
- Preview is approximate (ducking = music at 35%, volume capped at 100%, browser font fallback).
- Local Homebrew ffmpeg has no libass: golden tests strip captions/text there; Docker covers them.
- run_once doesn't requeue clips stuck in `rendering` after a crash; the loop does on start.
- Render reads clip files only while they exist; unselected clip files are deleted at cleanup.
