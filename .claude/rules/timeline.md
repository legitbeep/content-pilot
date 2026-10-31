---
paths:
  - "packages/timeline-schema/**"
  - "**/timeline/**"
  - "apps/worker/worker/timeline.py"
---
# Timeline rules

A timeline schema change updates all five in the same change:
1. `packages/timeline-schema/timeline.schema.json`
2. zod mirror `packages/timeline-schema/src/index.ts`
3. pydantic mirror `apps/worker/worker/timeline.py`
4. fixtures in `packages/timeline-schema/fixtures/` (a valid example of the new shape + an invalid case)
5. `docs/timeline.md`

Done when `pnpm test` passes for both mirrors. Use the `change-timeline-schema` skill.
