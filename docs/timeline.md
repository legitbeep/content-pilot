---
covers:
  - packages/timeline-schema
  - apps/worker/worker/timeline.py
  - apps/web/src/lib/entities/timeline
  - apps/worker/seeds/editor.py
  - apps/worker/worker/render.py
  - apps/worker/loops/render.py
  - apps/web/src/lib/widgets/editor
  - apps/web/src/routes/(authed)/(shell)/editor
last_updated: 2026-11-01
---
# Timeline

The **only** way a clip changes. Editor UI and editor agent both produce a new timeline JSON;
the worker renders it with FFmpeg on save. Web never touches video bytes.

## Sources of truth (keep in sync — see `.claude/rules/timeline.md`)
1. `packages/timeline-schema/timeline.schema.json` — the contract
2. `packages/timeline-schema/src/index.ts` — zod mirror (web) — `import { Timeline } from '@clip-studio/timeline-schema'`
3. `apps/worker/worker/timeline.py` — pydantic mirror (worker)
4. `packages/timeline-schema/fixtures/{valid,invalid}/` — both mirrors are tested against these;
   `fixtures/captions.json` tests both caption mappers (`captionChunks` / `caption_chunks`)
5. this doc

`end > start` and "blur region fits in the frame" can't be expressed in JSON Schema; zod and
pydantic enforce them.

## Shape (v2)
```json
{
  "version": 2,
  "sourceKey": "clips/5d2c…/source.mp4",
  "aspect": "9:16",
  "cropX": 0.5,
  "segments": [{ "start": 5, "end": 20.2 }, { "start": 1, "end": 4, "sourceKey": "clips/9a1f…/source.mp4" }],
  "originalAudio": { "muted": false, "volume": 1 },
  "audio": [{ "id": "music-1", "kind": "music", "key": "uploads/<user>/<id>/song.m4a", "start": 0, "volume": 0.5, "muted": false }],
  "ducking": true,
  "captions": { "enabled": true, "style": { "font": "Hanken Grotesk", "color": "#FFFFFF", "position": "bottom", "size": "medium", "wordsPerChunk": 3 } },
  "textOverlays": [{ "start": 0, "end": 3, "text": "Pricing myth #1", "position": "top" }],
  "blurRegions": [{ "start": 1, "end": 3, "x": 0.1, "y": 0.1, "w": 0.3, "h": 0.2 }]
}
```
- `sourceKey`: the **clip file** (`clips.file_key`), cut by `extract_clips` with 5s handles
  before and after. Not the original upload — that is deleted at cleanup.
- `segments`: kept ranges **of a source file** (seconds from its start), in output order
  (cuts, reorders). `sourceKey` on a segment = another clip file of the same session or an
  uploaded video (`uploads/<user_id>/…`, merge); default is the timeline's `sourceKey`. The
  initial segment is `[5, 5 + clip length]` (or less if the handle was clamped at the source
  start); trims may extend into the handles (`0 … file duration`).
- `cropX`: horizontal crop position (0 left … 1 right) when the source is wider than `aspect`.
- `originalAudio`: the segments' own audio. `audio`: added voiceover/music tracks; `start` on the
  output timeline, `volume` 0..2 (1 = unchanged). `ducking`: lower music under speech.
- `captions`: burned-in captions. **Text is not stored**: it is derived from `clips.words` of each
  segment's source (words whose midpoint is inside the segment, mapped to output time, grouped
  `wordsPerChunk` at a time, never across a cut). Same function in both mirrors.
- `textOverlays`, `blurRegions`: times on the **output** timeline. Blur `x, y, w, h` are
  fractions (0..1) of the output frame.
- `aspect`: `9:16` | `1:1` | `16:9`.
- New timelines: `newTimeline(sourceKey, start, end)` (9:16, captions on, default style).

**v1 → v2**: breaking. No v1 rows existed when v2 landed (plan 6), so there is no migration; v1
JSON is rejected (`fixtures/invalid/version-1.json`).

## Operations (`$lib/entities/timeline`)
Pure `(timeline, args) → { timeline, summary }` (summary = short human sentence, e.g. "Muted
original audio"). Run through `applyOp(timeline, name, args)`: validates args (zod), applies to a
copy, validates the result, throws `OpError` with a readable message. `opCatalog` lists every op
with `name`, `description`, zod `args`, `destructive`; the editor agent (plan 7) exposes exactly
these as tools. Times: "output" = seconds on the edited clip; segment `start/end` = source seconds.

| Op | Args | Destructive |
|---|---|---|
| `trim` | `{ segment, start?, end? }` (source s) | |
| `split` | `{ at }` (output s) | |
| `delete_range` | `{ start, end }` (output s, may span segments) | yes |
| `reorder` | `{ from, to }` (segment indexes) | |
| `merge_clip` | `{ sourceKey, start, end, at? }` | |
| `mute_track` | `{ track: 'original' \| audio id, muted }` | |
| `set_volume` | `{ track, volume 0..2 }` | |
| `add_audio` | `{ kind: voiceover \| music, key, start = 0, volume = 1 }` → id `<kind>-<n>` | |
| `remove_audio` | `{ track }` | yes |
| `set_ducking` | `{ enabled }` | |
| `set_aspect` | `{ aspect }` | |
| `set_crop_offset` | `{ x 0..1 }` | |
| `blur_region` | `{ start, end, x, y, w, h }` | |
| `add_text_overlay` | `{ start, end, text, position = top }` | |
| `toggle_captions` | `{ enabled }` | |
| `set_caption_style` | `{ font?, color?, position?, size?, wordsPerChunk? }` | |

`history.ts`: pure undo/redo stack (`initHistory`, `push`, `undo`, `redo`) of `{ value, summary }`.

## Storage
`timelines.data` (jsonb), `revision` bumps on every save. Render needed when
`rendered_revision < revision`; worker writes `rendered_key` + `rendered_revision`.

Every applied op (and every undo/redo, op `undo`/`redo`) is appended to `edit_events`
(`clip_id, op, args, summary, source manual|agent`); plan 7 learns from these.

Renders read only clip files and the user's uploads. Unselected clip files are deleted at cleanup
(`docs/pipeline.md`), so only selected clips can be rendered or merged. Every key a timeline
references must be one of the user's clip files or under `uploads/<user_id>/` (checked on save
and again by the worker).

## Editor (`$lib/widgets/editor`, route `/editor/[clipId]`)
- `EditorState` (`editor-state.svelte.ts`): history (`$state.raw`), playhead, selection, marks,
  `urls` (R2 key → presigned GET), `durations`. `apply(op, args, source)` runs `applyOp`, pushes
  history, queues an edit event and autosaves after 800ms (`flush()`; one save at a time).
  The agent chat (`AgentChat` from `$lib/features/editor-agent`, right column under Properties)
  applies agent ops with `apply(op, args, 'agent')` (`docs/agent.md`).
- Actions (`+page.server.ts`): `save` {revision, timeline, events, render?} — zod-validates, checks
  key ownership, `update … where revision = expected` (409 = changed elsewhere), inserts
  `edit_events`, optionally queues the render; `renderAll` queues every session clip (creates
  missing timelines); `presignUpload` → `uploads/<user_id>/<uuid>/<name>` PUT + GET URLs.
  `GET /editor/[clipId]/renders` → session render status + presigned render URLs (polled by the
  finish dialog). First open of a clip without a timeline creates `newTimeline(...)`.
- Preview is approximate (CSS crop via `object-position`, ducking = music at 35%, volume capped at
  100%); the render is the truth.

## Seed data
`pnpm seed:editor` (`apps/worker/seeds/editor.py`): for the dev-login user (or `SEED_EMAIL`), one
done job tagged `jobs.note = 'seed:editor'` with 3 selected clips (ffmpeg test patterns: vertical
testsrc2 440 Hz, horizontal smptebars 660 Hz, horizontal hue-shifted testsrc2 330 Hz; 20s files =
10s clip + 5s handles), word slices, initial timelines, and `uploads/<user_id>/seed-editor/
{voiceover,music}.m4a`. Ids are uuid5 of the user, so re-running resets the same rows.
`pnpm seed:editor:clean` deletes exactly those rows (cascade) and R2 objects.

## Render (`apps/worker/loops/render.py`, `apps/worker/worker/render.py`)
- **Queue**: Save (or Finish all clips) sets `clips.render_status = 'queued'`,
  `render_requested_at = now()`. The render loop (its own thread, registered in `main.py`) claims
  one clip with `FOR UPDATE SKIP LOCKED` → `rendering`, renders, uploads `renders/<clip_id>.mp4`,
  sets `render_path`, `rendered_at`, `render_status = 'done'` and `timelines.rendered_key /
  rendered_revision`. Failure → `failed` + user-readable `render_error`. Finishing only overwrites
  `rendering`, so a Save during a render re-queues and wins. On loop start, `rendering` rows go back
  to `queued` (assumes one worker process). Debug: `python -m worker.run_once render <clip_id>`.
- **Statuses** (`clips.render_status`, text + CHECK): null (never) · queued · rendering · done · failed.
- The worker refuses any key that isn't one of the user's clip files or under `uploads/<user_id>/`.
- **Upload safety check**: before rendering, every `uploads/<user_id>/…` key in the timeline goes
  through `nsfw_check.check_upload` (videos in `segments` → image model on 1 fps frames; `audio[]`
  → transcription + `moderate_text` on the user's keys). Explicit → the upload is deleted and the
  render fails with "<file> contains explicit content and can't be used. Remove it from this
  clip."; borderline is allowed. Verdicts are cached at `safety/<key>.json` (outside `uploads/`,
  so the browser can't forge one), so each file is checked once. A missing AI key or model fails
  the render with "Couldn't safety-check <file>: …" (`docs/pipeline.md`).
- Inputs are presigned GET URLs read by ffmpeg directly; `ffprobe` decides per source whether it
  has audio (silence is generated if not).
- **Captions/text need libass** (`subtitles` filter): present in the Docker image (Debian ffmpeg),
  missing in Homebrew ffmpeg; without it a render with captions/text fails with a clear message.
- **Caption fonts**: the Docker image installs Hanken Grotesk (the default) and the brand
  `CAPTION_FONTS` (Inter, Montserrat, Poppins, Bebas Neue, Anton, Roboto) from google/fonts,
  pinned by sha256 (`apps/worker/Dockerfile`); libass picks them by family name. Any other name
  falls back to DejaVu Sans.

## FFmpeg mapping
Output: H.264 (`veryfast`, CRF 20, yuv420p) + AAC 160k, `+faststart`, 30 fps, `-t` = sum of segments.
| Timeline | FFmpeg |
|---|---|
| `segments` | one input per segment: `-ss start -t len -i <url>`; per segment crop/scale/`fps=30`/`trim`, audio `aformat` 48k stereo + `apad,atrim` (or `anullsrc` if the source has no audio); `concat=n=N:v=1:a=1` |
| `aspect` + `cropX` | cover crop `crop=w='min(iw,ih*R)':h='min(ih,iw/R)':x='(iw-ow)*cropX':y='(ih-oh)/2'`, then `scale` to 9:16 1080x1920 · 1:1 1080x1080 · 16:9 1920x1080 |
| `blurRegions` | per region `split` → `crop` → `boxblur` → `overlay=…:enable='between(t,s,e)'` (pixels from fractions of the output) |
| `captions` + `textOverlays` | one `.ass` file (`build_ass`) → `subtitles=` (burned in). Captions: `captionChunks`, style font/colour/size (4.5/6/7.5% of height)/position (ASS alignment 2/5/8); overlays: white, 5% of height |
| `originalAudio` | `volume` on the concatenated audio (0 when muted) |
| `audio` | per unmuted track `-i <url>`, `volume`, `adelay=start_ms:all=1`; voiceovers mix with the original (`amix duration=first normalize=0`) |
| `ducking` | music bus → `sidechaincompress` keyed by the speech bus (threshold 0.02, ratio 8), then mixed |

Golden tests (`apps/worker/tests/test_render.py`) render every valid fixture from generated media
and assert duration, resolution and an audio stream with ffprobe (captions stripped when the local
ffmpeg has no libass).
