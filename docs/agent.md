---
covers:
  - apps/web/src/lib/server
  - apps/web/src/lib/server/agent
  - apps/web/src/lib/features/editor-agent
  - apps/web/src/routes/api/editor
last_updated: 2026-11-01
---
# Editor agent

Chat panel in the editor (plan 6's agent slot). The user types or speaks a messy request; the
agent turns it into a checklist of timeline operations on the **open clip** and the editor runs
them. All AI goes through `generateJSON` (`docs/llm.md`) on the user's own key (ADR 0008).

## Flow
1. `POST /api/editor/agent` `{ clipId, message, timeline }` (the editor's current, maybe unsaved,
   timeline). `requireAIKeys('llm')` (409 before the stream starts). Context from
   `loadSession` (`$lib/server/agent/session.ts`, RLS client): the open clip, the session's selected
   clips (ids, file keys, clip range in the file, reason), the user's uploaded media keys
   (`listKeys('uploads/<user_id>/')` in `$lib/server/r2.ts`) and
   `buildMemoryContext(profile, rules, { scope: 'editing' })`.
2. **Understand** (task `understand_request`, `understand()`): `{ request, side_notes }`. The last
   correction wins, fillers drop, late modifiers attach to the right slot, digressions →
   `side_notes`. Empty request → no plan.
3. **Plan** (task `plan_edits`, `planEdits()`): `{ steps, reply }`. The prompt lists every tool
   with its zod args as JSON Schema, the timeline JSON, the open clip's transcript in output
   seconds, session clips and uploads. The plan is **dry-run** with `executePlan` (zod args, sandbox,
   result validated); on failure it re-plans once with the error, then fails with "I couldn't make
   a plan that works: …".
4. Response is SSE: `status {text}` · `understood {request, side_notes}` ·
   `plan {steps, reply, destructive}` · `error {message}`.
5. The browser shows the checklist. No destructive step → runs at once; otherwise Confirm / Cancel.
   Each op runs through `EditorState.apply(op, args, 'agent')` (same history, autosave and
   `edit_events` with `source = 'agent'`). A failing step stops the run, shows why, offers Retry.
   "Undo plan" undoes every op of that plan (only while nothing was edited after it).
6. `side_notes` show as "Also heard: …" chips (dismissable). No reminders.

## Plan format (`$lib/features/editor-agent/model.ts`, pure, used by server and browser)
```json
[{ "id": "t1", "clip_id": "<open clip>", "tool": "set_aspect", "args": { "aspect": "9:16" }, "depends_on": [], "summary": "Make it vertical" }]
```
- Tools: every `opCatalog` op (`docs/timeline.md`), plus
  - `find_moment {query}` → `{ranges: [{start, end, text}]}` on the output timeline. Searches what
    is **said** (transcript words, mapped through the segments like captions), not visuals; the UI
    says so. Later steps may pass `"$<step id>.start"` / `"$<step id>.end"` as a number arg
    (first range).
  - `propose_memory_update {rule, scope = editing}` → a suggestion, not a timeline change.
- **Sandbox** (`checkPlan`): only these tools; `clip_id` must be the open clip (other session clips
  can only be merged in); ≤ 20 steps; `depends_on` must point to earlier steps; `sourceKey`/`key`
  args must be a session clip file or one of the user's uploads. No network, files or memory
  writes from steps.
- `executePlan(timeline, steps, ctx)` → `{ timeline, results, error: {step, message} | null }`;
  `runStep` runs one step; `isDestructive(steps)` (any catalog op with `destructive`).

## Chat panel + voice (`agent-chat.svelte`)
- Lives in the editor's right column (`AgentHost` = what it needs from `EditorState`). Messages,
  a checklist card per plan (pending / done / failed ticks), "Also heard" chips, Confirm / Cancel
  for destructive plans, Retry from the failed step, Undo plan. Enter sends, Shift+Enter = newline.
  Send is wrapped in `<RequiresAI need="llm">`.
- **Voice**: the mic button exists only when `page.data.ai.voice` (a Wispr or Groq key, or demo).
  Click to start/stop, or hold `V` (push-to-talk, `shortcuts.ts`, ignored while typing). The
  browser records (MediaRecorder), resamples to 16 kHz mono PCM16 WAV (`encodeWav` in
  `voice.ts`) and posts it to `POST /api/editor/voice` (`audio/wav`, ≤ 6 MB) →
  `transcribeVoice` (`docs/llm.md`). The text lands in the input box for review; nothing is sent
  automatically. Typing always works.

## Memory proposals
The agent never writes active rules (CLAUDE.md hard rule 4). `propose_memory_update` goes through
the same learned-rule pipeline as edits (`docs/brand-memory.md` → Learned rules): a `candidate` the
user reviews on Brand memory.

## Tests
`model.test.ts` (executor with fixed plans, incl. the acceptance message's plan; sandbox; refs) and
`$lib/server/agent/agent.test.ts` (recorded LLM output through a mocked `generateJSON`, validated
by the real schemas: good plan, re-plan once, give up).
