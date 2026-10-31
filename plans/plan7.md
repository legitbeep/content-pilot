# Plan 7: Editor agent, voice input, learning from edits

Wave 2 (needs plans 4 and 6 merged). Branch `feat/agent`, dev port 5174.
Read plans/parallel-rules.md, CLAUDE.md, docs/INDEX.md, then only: agent, timeline,
brand-memory, llm, auth-and-keys, design-system. Plan mode first. Commit per phase.
All AI calls go through the LLM adapter (tasks `understand_request`, `plan_edits`,
`learn_rules`); never import a provider SDK. Use docs/llm.md's voice fallback hook
(Groq Whisper) if plan-llm built it.

## Phase 1: Planner + executor

1. `POST /api/editor/agent` (streams over SSE). Inputs: the user's message, the
   session's clip ids, their timelines, word slices, descriptions, and
   `buildMemoryContext(..., { scope: "editing" })`.
2. **Understand the request** (one LLM call): turn messy input into a clean request.
   Rules: the last correction wins ("Tuesday, no wait, Thursday" -> Thursday);
   fillers are ignored; late modifiers attach to the right slot ("...on LinkedIn I
   mean"); digressions go to `side_notes`.
3. **Plan:** a todo list
   `[{ id, clip_id, tool, args, depends_on, summary }]` using only the operation
   catalog from plan 6, plus `find_moment` (searches a clip's words, returns time
   ranges; it works on what is said, not on visuals, and the UI says so), and
   `propose_memory_update`. Validate every step's args with the catalog's zod schemas;
   on failure, re-plan once with the error.
4. Show the plan in chat as a checklist. Auto-run if no step is destructive;
   otherwise show Confirm / Edit.
5. **Execute** steps in order, applying the pure functions, ticking the checklist
   live. On failure stop, explain and offer retry. All steps of a plan form one undo
   group ("Undo plan").
6. **Sandbox:** only catalog tools; only clips in this session; max 20 steps; no
   network, files or direct memory writes. `edit_events.source = agent`.
7. Side notes appear as "Also heard: ..." chips with dismiss. No reminder system.

## Phase 2: Chat panel + voice

1. Fill plan 6's agent slot: message list, checklist cards, input box with a mic
   button.
2. Voice via Wispr Flow: check the current Wispr API/SDK docs. The stored key must
   never reach the browser: use server-side calls, an ephemeral token, or proxy audio
   through a SvelteKit endpoint. The transcript lands in the input box for review
   before sending. No valid Wispr key -> no mic button; typing always works.
3. Push-to-talk shortcut; add it to shortcuts.ts.

## Phase 3: Learning from edits

1. Analyzer runs after "Finish all clips" (and after every 25 new events). Inputs:
   `edit_events`, `clip_feedback`, caption edits (written by plan 9 as edit_events of
   kind caption, if present).
2. Ignore trivial events (small trims, typo fixes). The LLM extracts patterns and
   matches each against existing rules ("same as rule X?").
3. New pattern -> `brand_rules` candidate (source: edits, evidence 1). Match ->
   evidence +1. At 3+ -> active, with a toast "New rule learned: ...".
4. Conflict with a stated rule -> wire the ConflictCard on Brand Memory and show a
   toast. Never override a stated or pinned rule silently.
5. `propose_memory_update` from the agent goes through the same pipeline.

## Acceptance

- pnpm check and pnpm test pass (planner output validated against schemas; executor
  tests with fixed plans).
- On seed data, this message produces a correct plan and result:
  "make it vertical, uh, mute the original, no wait, lower it to 20 percent, and add
  my voiceover, then merge clip 2 at the end. oh and remind me to call the guest"
- "Undo plan" reverts everything from one message.
- Repeating the same manual edit on 3 clips creates an active learned rule.
- Handoff note written.
