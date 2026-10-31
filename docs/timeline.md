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
  "sourceKey": "uploads/u1/podcast.mp4",
  "aspect": "9:16",
  "segments": [{ "start": 120, "end": 135.2 }, { "start": 140, "end": 158 }],
  "captions": [{ "start": 0, "end": 2.4, "text": "Here's the thing" }],
  "textOverlays": [{ "start": 0, "end": 3, "text": "Pricing myth #1", "position": "top" }]
}
```
- `segments`: kept ranges of the **source**, in output order (cuts, reorders).
- `captions`, `textOverlays`: times on the **output** timeline.
- `aspect`: `9:16` | `1:1` | `16:9`.

## Storage
`timelines.data` (jsonb), `revision` bumps on every save. Render needed when
`rendered_revision < revision`; worker writes `rendered_key` + `rendered_revision`.

Note: `cleanup_source` deletes the source after clip extraction, so renders need their own copy.
Open question: keep a trimmed per-clip source (e.g. `clips/<id>/source.mp4` written by
`extract_clips`) and point `sourceKey` at it. Decide before building the renderer.

## FFmpeg mapping (planned)
| Timeline | FFmpeg |
|---|---|
| `segments` | `trim`/`atrim` per segment + `setpts`/`asetpts`, then `concat=n=N:v=1:a=1` |
| `aspect` 9:16 | `crop=ih*9/16:ih,scale=1080:1920` (center crop) |
| `aspect` 1:1 | `crop=ih:ih,scale=1080:1080` |
| `aspect` 16:9 | `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2` |
| `captions` | write `.ass` file → `subtitles=` filter (burned in) |
| `textOverlays` | `drawtext=text=...:enable='between(t,start,end)'`, y by `position` |
