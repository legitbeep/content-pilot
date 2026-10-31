# Plan 6: Editor (manual editing + render)

Wave 1 (parallel with plans 4 and 8). Branch `feat/editor`, dev port 5174.
Read plans/parallel-rules.md, CLAUDE.md, docs/INDEX.md, then only: timeline, pipeline,
data-model, design-system. Plan mode first. Commit after each phase.

## Phase 1: Seed + timeline operations

1. `pnpm seed:editor`: a fake job with 3 clips (ffmpeg-generated vertical and
   horizontal test videos with different colours/tones), word slices, a sample
   voiceover and a music track, all uploaded to R2. Plus `seed:editor:clean`.
2. Pure, zod-validated, fully unit-tested operations in entities/timeline:
   trim, split, delete_range, reorder, merge_clip, mute_track, set_volume,
   add_audio (voiceover | music), set_ducking, set_aspect, set_crop_offset,
   blur_region, add_text_overlay, toggle_captions, set_caption_style.
   Each takes `(timeline, args)` and returns `{ timeline, summary }`, where summary is
   a short human sentence ("Muted original audio"). Args must be plain JSON: plan 7
   exposes these exact functions as agent tools, so export a catalog with name,
   description, zod args schema and a `destructive` flag.
3. Every applied operation appends to `edit_events` (clip_id, op, args, summary,
   source: manual | agent, created_at). Plan 7 learns from these.
4. Undo/redo stack; debounced autosave to `timelines` with a version number.

## Phase 2: Editor UI (`/editor/[clipId]`)

1. Layout: left, the session's clips with status; centre, preview; bottom, tracks
   (video, audio tracks, captions) with the yellow playhead and Timecode labels;
   right, properties panel; plus an empty, clearly marked slot for the agent chat
   (plan 7 fills it).
2. Preview: play segments from presigned GET URLs with in/out points, sync audio
   tracks, render captions as an overlay from the word slice, apply aspect with a CSS
   crop. The preview is approximate; the render is the truth.
3. Aspect picker labels: "9:16 - YouTube Shorts, Reels, TikTok", "1:1 - Instagram
   feed, LinkedIn", "16:9 - YouTube, X".
4. Uploads (voiceover, music, extra clip) via presigned PUT to `uploads/{user_id}/`.
   "Add clip" can also pick other clips from the same session.
5. Keyboard: Space play/pause, J/K/L, S split, I/O in/out, Backspace delete,
   Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo. Add to shortcuts.ts and the sheet.

## Phase 3: Render

1. "Save" sets `render_status = queued` on the clip. A worker loop
   (loops/render.py) claims renders with SKIP LOCKED.
2. Timeline -> FFmpeg: trim + concat, scale/crop to aspect (1080 wide), burned-in
   captions via an ASS file (2-3 words per chunk, brand font/colours), boxblur on
   regions, text overlays, amix with volumes, sidechain ducking when enabled.
   Output H.264/AAC with faststart to `renders/{clip_id}.mp4`; store `render_path`.
3. Golden tests: render each timeline fixture and assert duration, resolution and
   audio stream with ffprobe.
4. "Finish all clips" renders the whole session, then shows a summary with previews
   and a link to `/publish` (route comes from plan 8).
5. Document the timeline -> FFmpeg mapping in docs/timeline.md.

## Acceptance

- pnpm check and pnpm test pass, including golden renders.
- On seed data: trim, split, merge another clip, mute original, add voiceover +
  music with ducking, switch to 9:16, captions on -> render plays correctly.
- Undo/redo and reload-after-autosave work.
- Handoff note written, including the operation catalog.
