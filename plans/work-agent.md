# Plan 7 work plan (feat/agent)

Binding overrides (STATUS.md "Wave 2 overlap + ownership", user brief): learners never activate
rules; they write `brand_rules` `candidate` rows only (source `edits`, evidence appended, count +1
per new clip). 3+ evidence = "ready" in the review UI + toast "New rule ready to review: …".
Review on /brand "Learned from you" reuses plan 4's regenerate tick-box diff (extracted into one
component, used by both). Conflicts use plan 4's ConflictCard. `clip_feedback` is read only (plan 5
owns; tolerate missing). Caption edits = `edit_events.op = 'caption_edit'` (plan 9; tolerate none).

## Phase 1: planner + executor
- `$lib/features/editor-agent/model.ts` (pure, shared by server + browser): `PlanStep` zod
  `{id, clip_id, tool, args, depends_on, summary}`, tools = `opCatalog` + `find_moment` +
  `propose_memory_update`; `findMoment(timeline, words, query)` (spoken words → output ranges);
  `runStep` / `executePlan` (sandbox: only catalog tools, only the open clip, max 20 steps, keys
  limited to session clip files + the user's uploads; `$t1.start` refs to a find_moment result).
- `$lib/server/agent/`: `understand` (task understand_request → `{request, side_notes}`),
  `planEdits` (task plan_edits → steps; dry-run with `executePlan`; on error re-plan once with the
  error), context (session clips, words, uploads, `buildMemoryContext(..., {scope:'editing'})`).
- `POST /api/editor/agent` (SSE): `requireAIKeys('llm')`, streams `understood`, `plan`, `error`.
- Tests: executor with fixed plans (incl. the acceptance message's plan), planner with mocked
  `generateJSON` (valid, invalid → re-plan, double failure).

## Phase 2: chat panel + voice
- `features/editor-agent/agent-chat.svelte` in plan 6's slot: messages, checklist (auto-run unless
  destructive → Confirm / Cancel), "Also heard" chips, Undo plan (undo N), Retry on failure.
- Voice: browser records → 16 kHz mono WAV → `POST /api/editor/voice` → `$lib/server/llm/voice.ts`
  (Wispr REST `/api/v1/dash/api` with the user's org key, else Groq Whisper with the user's key).
  Key never reaches the browser. No voice capability → no mic button. Push-to-talk: hold V
  (shortcuts.ts).

## Phase 3: learning from edits
- Migration `p7_learn_cursor` (per-user last analyzed event time; compare-and-set claim).
- `$lib/server/agent/learn.ts`: trivial filter (undo/redo, split, trims < 1s from the clip's
  original bounds, caption typo fixes), `learn_rules` LLM call with rule refs, pure
  `applyPatterns` → candidate inserts/updates, ready list, conflicts (`conflicts_with`).
- `POST /api/editor/learn` (after every save: runs only at 25+ new events; after Finish all:
  forced). `propose_memory_update` → `POST /api/editor/propose` → same `applyPatterns`.
- /brand: extract `RuleReview` from the regenerate diff; Learned tab = ConflictCards + review
  (ready ticked by default), `?/learned` actions: activate ticked, dismiss → archived,
  keep mine / update rule.
- Seeds `pnpm seed:agent` / `seed:agent:clean` (reuses seeds/editor.py with tag `seed:agent`,
  plus edit events, a conflicting stated rule + candidates incl. a `performance` one).

Docs: agent.md, brand-memory.md (Learned rules / Conflicts), timeline.md (editor slot),
llm.md (voice), design-system.md (shortcut), data-model.md + architecture.md (append).
