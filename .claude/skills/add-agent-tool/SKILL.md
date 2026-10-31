---
name: add-agent-tool
description: Add a tool for the editor agent — a pure timeline function plus its tool schema.
---
# Add an editor agent tool

1. Read `docs/agent.md` and `docs/timeline.md`.
2. Write a **pure** function `(timeline: Timeline, args) => Timeline` — no I/O, no DB, returns a
   new object, validates result with `Timeline.parse`. Home: `src/lib/entities/timeline/` (shared
   with the manual editor) — see `docs/agent.md`.
3. Define the tool schema (name, description, JSON input schema matching `args`) next to the
   agent's tool registry in `src/lib/server/agent/`.
4. A tool touching brand memory returns a **proposal** object; it never writes `brand_rules`.
5. Add a vitest test: input fixture → expected timeline, plus one invalid-args case.
6. Add the tool to the tools table in `docs/agent.md`.
7. Update affected docs + run `pnpm check` and `pnpm test`.
