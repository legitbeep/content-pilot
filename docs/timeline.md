---
covers:
  - packages/timeline-schema
  - apps/worker/worker/timeline.py
last_updated: 2026-10-31
---
# Timeline

The **only** way a clip changes. Editor UI and editor agent both produce a new timeline JSON;
the worker renders it with FFmpeg on save. Web never touches video bytes.

## Sources of truth (keep in sync — see `.claude/rules/timeline.md`)
1. `packages/timeline-schema/timeline.schema.json` — the contract
2. `packages/timeline-schema/src/index.ts` — zod mirror (web) — `import { Timeline } from '@clip-studio/timeline-schema'`
3. `apps/worker/worker/timeline.py` — pydantic mirror (worker)
4. `packages/timeline-schema/fixtures/{valid,invalid}/` — both mirrors are tested against these
5. this doc

`end > start` can't be expressed in JSON Schema; zod and pydantic enforce it.

## Shape (v1)
```json
{
  "version": 1,
  "sourceKey": "clips/5d2c…/source.mp4",
  "aspect": "9:16",
  "segments": [{ "start": 5, "end": 20.2 }, { "start": 25, "end": 43 }],
  "captions": [{ "start": 0, "end": 2.4, "text": "Here's the thing" }],
  "textOverlays": [{ "start": 0, "end": 3, "text": "Pricing myth #1", "position": "top" }]
}
```
- `sourceKey`: the **clip file** (`clips.file_key`), cut by `extract_clips` with 5s handles
  before and after. Not the original upload — that is deleted at cleanup.
- `segments`: kept ranges **of the clip file** (seconds from its start), in output order
  (cuts, reorders). The initial segment is `[5, 5 + clip length]` (or less if the handle was
  clamped at the source start); trims may extend into the handles (`0 … file duration`).
- `captions`, `textOverlays`: times on the **output** timeline.
- `aspect`: `9:16` | `1:1` | `16:9`.

## Storage
`timelines.data` (jsonb), `revision` bumps on every save. Render needed when
`rendered_revision < revision`; worker writes `rendered_key` + `rendered_revision`.

Renders read only the clip file. Unselected clip files are deleted at cleanup
(`docs/pipeline.md`), so only selected clips can be rendered. Caption text comes from
`clips.words` (same time base as the clip file); output-timeline caption times are derived by
mapping word times through the kept segments.

## FFmpeg mapping (planned)
| Timeline | FFmpeg |
|---|---|
| `segments` | `trim`/`atrim` per segment + `setpts`/`asetpts`, then `concat=n=N:v=1:a=1` |
| `aspect` 9:16 | `crop=ih*9/16:ih,scale=1080:1920` (center crop) |
| `aspect` 1:1 | `crop=ih:ih,scale=1080:1080` |
| `aspect` 16:9 | `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2` |
| `captions` | write `.ass` file → `subtitles=` filter (burned in) |
| `textOverlays` | `drawtext=text=...:enable='between(t,start,end)'`, y by `position` |
