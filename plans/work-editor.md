# Work plan: plan 6 editor (feat/editor)

## Decisions
- **Timeline schema v2** (breaking, I own it). No v1 rows exist in the shared DB (checked:
  0 timelines), so no data migration. New fields, all required:
  `cropX` (0..1), `segments[].sourceKey?` (merge another clip / uploaded video),
  `originalAudio {muted, volume}`, `audio[] {id, kind voiceover|music, key, start, volume, muted}`,
  `ducking` (bool), `captions {enabled, style {font, color, position, size, wordsPerChunk}}`
  (caption text is derived from `clips.words`, not stored), `textOverlays[]`,
  `blurRegions[] {start, end, x, y, w, h}` (output time, coords 0..1 of the output frame).
- `captionChunks(timeline, wordsByKey)` lives in both mirrors (TS package + `worker/timeline.py`),
  tested against one shared fixture `fixtures/captions.json`.
- Ops in `apps/web/src/lib/entities/timeline`: pure `(timeline, args) -> {timeline, summary}`,
  zod args, catalog `{name, description, args, destructive, apply}` + `applyOp(name, args)`.
  Extra op beyond the list: `remove_audio` (UI needs it).
- Migration `p6_editor`: clips `render_status` (queued|rendering|done|failed, text, plan 8 already
  added it nullable), `render_path`, `render_error`, `render_requested_at`, `rendered_at`;
  `edit_events` table (own rows RLS). Timelines keep `revision`; worker also writes
  `rendered_key` / `rendered_revision`.
- Autosave: one `save` form action {clipId, revision, timeline, events[]}; update
  `where revision = expected` (409 on conflict), insert events. Undo/redo recorded as events.
- Server + worker both check every key in a timeline belongs to the user (own clip file or
  `uploads/{user_id}/`).
- Render: `apps/worker/loops/render.py` (claim SKIP LOCKED, run, upload `renders/{clip_id}.mp4`),
  pure `build_command` in `worker/render.py`. One input per segment (`-ss/-t`), per-segment
  crop/scale/fps normalize, concat, blur via split/crop/boxblur/overlay, captions + text overlays
  in one ASS file (`subtitles=`), audio via volume/adelay/amix + sidechaincompress for ducking.
  Output sizes: 9:16 1080x1920, 1:1 1080x1080, 16:9 1920x1080 (as docs/timeline.md says).
- Local Homebrew ffmpeg has no libass: golden tests strip captions/overlays when `subtitles`
  filter is missing; the real acceptance render runs in Docker via run_once.
- Seed: `apps/worker/seeds/editor.py` (python: ffmpeg + boto3 + psycopg), deterministic uuid5 ids,
  job tagged `note = 'seed:editor'`, for the dev-login user. `pnpm seed:editor[:clean]`.

## Phase 1: seed + timeline ops
1. Schema v2 in json/zod/pydantic, fixtures, captionChunks + shared fixture, docs/timeline.md.
2. Migration, apply with psql, docs/data-model.md.
3. Seed script + r2 helpers (upload_file, delete).
4. entities/timeline ops + catalog + history (undo/redo) + tests.

## Phase 2: editor UI `/editor/[clipId]`
- `+page.server.ts`: load clip, session clips (same job, selected), timeline (create initial if
  missing), words, presigned GET URLs; actions `save`, `presignUpload`, `render`, `renderAll`.
- `widgets/editor`: layout (clips list, preview, tracks, properties, agent slot), keyboard,
  autosave. Shortcuts in shortcuts.ts (page '/editor').

## Phase 3: render
- worker render module + loop + run_once `render` + main.py line, golden tests.
- Save/Finish all UI, renders status endpoint + summary dialog with link to /publish.
- Docs: timeline.md FFmpeg mapping, pages.md, pipeline.md (r2), queue.md if needed.
