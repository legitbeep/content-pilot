# packages/timeline-schema

The timeline contract. `timeline.schema.json` is the source of truth; `src/index.ts` is the
zod mirror; the pydantic mirror is `apps/worker/worker/timeline.py`. Read `docs/timeline.md`.

Any schema change follows the `change-timeline-schema` skill (5 places in one change).
Tests: `pnpm --filter @clip-studio/timeline-schema test` and worker pytest — both run every
fixture in `fixtures/valid` (must pass) and `fixtures/invalid` (must fail).
