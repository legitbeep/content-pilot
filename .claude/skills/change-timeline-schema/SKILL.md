---
name: change-timeline-schema
description: Change the timeline JSON shape — add/rename/remove a field or allowed value.
---
# Change the timeline schema

1. Read `docs/timeline.md`.
2. Edit `packages/timeline-schema/timeline.schema.json`. Breaking change → bump `version` const
   and decide how stored timelines migrate (note it in `docs/timeline.md`).
3. Mirror in zod: `packages/timeline-schema/src/index.ts`.
4. Mirror in pydantic: `apps/worker/worker/timeline.py`.
5. Fixtures: update `fixtures/valid/full.json` to use the new shape; add an
   `fixtures/invalid/<case>.json` the new rule rejects.
6. Update `docs/timeline.md` (shape, field notes, FFmpeg mapping) and `docs/agent.md` if tools change.
7. `pnpm test` — both mirrors must accept every valid and reject every invalid fixture.
8. Update affected docs + run `pnpm check`.
