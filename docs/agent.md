---
covers:
  - apps/web/src/lib/server
last_updated: 2026-10-31
---
# Editor agent

Not built yet. Lives in `apps/web/src/lib/server/agent/` and is called from an editor server
route (e.g. `src/routes/editor/+page.server.ts` action or `src/routes/api/agent/+server.ts`).
Calls the LLM only through `generateJSON` (`$lib/server/llm`, task `plan_edits` / `understand_request`; `docs/llm.md`) on the user's own key (ADR 0008).

## Flow
1. User message (typed, or Wispr voice → text) + current timeline + active brand rules.
2. **Planner**: model returns a todo list for multi-step requests.
3. Executor runs each todo via tool calls; each tool returns a *new* timeline.
4. Final timeline validated with zod → returned to the editor (unsaved). Save = bump
   `timelines.revision` → worker renders.

## Todo list format
```json
[{ "id": "t1", "text": "Cut the intro before 3s", "status": "pending" }]
```
`status`: `pending | in_progress | done | failed`. Streamed to the UI so the user sees progress.

## Tools
Timeline tools are the editor's operations: `opCatalog` in `$lib/entities/timeline` (built by
plan 6, catalog in `docs/timeline.md`). Each entry has `name`, `description`, zod `args`, a
`destructive` flag (ask before applying) and `apply`; run them with
`applyOp(timeline, name, args)` → `{ timeline, summary }` (throws `OpError` with a readable
message). Log each applied op to `edit_events` with `source = 'agent'`.
Extra agent-only tool: `proposeMemoryUpdate` `{ rule, evidence }` → returns a proposal, **not** a timeline.

## Memory proposals
The agent may never write `brand_rules`. `proposeMemoryUpdate` returns a proposal the UI shows;
on user accept, a normal server action inserts the rule (`source=learned`, `status=active`).
See `docs/brand-memory.md`.
