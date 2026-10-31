# Handoff: plan 7 (editor agent, voice, learning from edits)

Branch `feat/agent` (worktree `.worktrees/agent`), 4 commits on top of d291f6f. Not merged.
`pnpm check` and `pnpm test` pass (web 121, schema 11, worker 102).

## Built
- **Planner + executor**: `POST /api/editor/agent` (SSE: `status`, `understood`, `plan`, `error`),
  `requireAIKeys('llm')`. `understand` (task `understand_request`: last correction wins, fillers,
  late modifiers, `side_notes`) → `planEdits` (task `plan_edits`) → dry run with the pure executor →
  re-plan once with the error. Plan format + executor in `$lib/features/editor-agent/model.ts`
  (catalog ops + `find_moment` + `propose_memory_update`, `$t1.start` refs, sandbox: open clip only,
  ≤20 steps, keys limited to session clip files + the user's uploads).
- **Chat panel** in plan 6's agent slot (`AgentChat`): checklist ticking, auto-run unless
  destructive (Confirm/Cancel), Retry from failed step, "Undo plan", "Also heard" chips.
  Ops run through `EditorState.apply(op, args, 'agent')` → `edit_events.source = 'agent'`.
- **Voice**: mic only with `ai.voice`; click or hold `V`. Browser → 16 kHz mono WAV →
  `POST /api/editor/voice` → `$lib/server/llm/voice.ts` (Wispr REST `/api/v1/dash/api` with the
  stored org key, else Groq Whisper with the user's key, else demo Groq). Keys never reach the browser.
- **Learning**: `$lib/server/agent/learn.ts` + `POST /api/editor/learn` (after each save, runs at
  25+ new events; forced after Finish all clips) and `POST /api/editor/propose`. Only writes
  `candidate` rows (source `edits`), evidence appended, count +1 per new clip; 3+ → toast
  "New rule ready to review: …" (never activated). Reads `clip_feedback` and `op='caption_edit'`.
- **/brand Learned from you**: plan 4's regenerate tick-box diff extracted into `RuleReview`
  (`$lib/features/brand-rules`), used by both regenerate and the learned review (shows `edits` and
  `performance` candidates; ready ones highlighted + ticked). ConflictCard wired (Keep mine /
  Update rule). New action `?/learned`. `?tab=learned` opens the tab.

## Contracts
- Plan step `{id, clip_id, tool, args, depends_on, summary}`; SSE events above (`docs/agent.md`).
- Learned-rule lifecycle + evidence shapes + `READY_AT = 3` (`$lib/entities/brand`) in
  `docs/brand-memory.md` "Learned rules" / "Conflicts". Plan 9's performance candidates need no change.
- `BrandRule.conflicts_with?` added to the type (column already existed).
- No new LLM tasks (uses understand_request, plan_edits, learn_rules). No registry change.

## Adapter fixes
None. Added a new file `apps/web/src/lib/server/llm/voice.ts` (docs/llm.md asked plan 7 to put the
voice hook there); no change to the adapter interface.

## Migrations
- `supabase/migrations/20261101160000_p7_learn_cursor.sql` (`learn_cursor`, owner RLS). Applied to
  the shared DB with psql. Idempotent.

## Shared files touched (append-only / small)
`shortcuts.ts` (`talk` action, V), `widgets/editor/editor.svelte` (slot → AgentChat, learn calls
after save/finish), `lib/server/r2.ts` (`listKeys`), `entities/brand/model.ts` (`READY_AT`,
`conflicts_with?`), brand route (`+page.svelte`, `+page.server.ts`), `package.json` (seed scripts),
`apps/worker/CLAUDE.md`, docs: agent, brand-memory, llm, timeline, design-system, data-model,
architecture.

## Seed
`pnpm seed:agent` / `pnpm seed:agent:clean` (user `dev-agent@clip-studio.test`; sign in once via
`/auth/dev-login` first). Job tagged `seed:agent`; seeded rules carry `"seed": "seed:agent"`;
clean also deletes this user's `source='edits'` rules and `learn_cursor` row.

## Needs human (real keys / mic)
Dev server: `pnpm --filter web dev --port 5174` in the worktree, then `/auth/dev-login?next=/queue`.
Run `pnpm seed:agent`. Add a real Groq (or Claude/Gemini) key in Settings for the dev-agent user.
1. Agent acceptance: open `/editor/<clip one id>` (printed by the seed). In the agent box type
   "make it vertical, uh, mute the original, no wait, lower it to 20 percent, and add my
   voiceover, then merge clip 2 at the end. oh and remind me to call the guest" → Enter.
   Expect: checklist of 4 steps (set 9:16, original volume 20%, add voiceover
   `uploads/<uid>/seed-editor/voiceover.m4a`, merge clip 2 file 5-15s) auto-runs and ticks; an
   "Also heard: Remind me to call the guest" chip; the timeline shows a 2nd segment + voiceover;
   original volume slider 20%. No mute step.
2. Click "Undo plan" → all 4 changes revert (aspect stays 9:16 because the seed is already 9:16 —
   check volume, voiceover track and segment count).
3. Destructive: "cut the first 2 seconds" → Confirm/Cancel shown; Confirm applies.
4. Learning: on clip three trim the start by ~2s (drag or Backspace on 0-2s), Save, then
   "Finish all clips". Expect toast "New rule ready to review: Cut the first 2 seconds…" (model
   dependent) and/or a conflict toast; `/brand?tab=learned` shows it ready (3 times) and/or as a
   ConflictCard vs "Keep the full intro of every clip." Nothing active until you tick + "Use
   selected rules" or click "Update rule".
5. Voice: add a Wispr Flow key (or rely on Groq) → mic button appears; hold V (not in a text
   field), speak, release → transcript lands in the box, not sent. With no Wispr/Groq key the mic
   button is absent.
6. Ask "from now on always add a hook text in the first second" → a propose step; the rule shows
   under Learned from you as a candidate.
Also verified without keys: Brand memory review/ConflictCard flows in the browser, API 409s, and a
learn run against the seed with a mocked model (candidate → evidence 3, ready, cursor claimed).

## Risks / gaps
- Agent edits only the open clip (other session clips can be merged in, not edited) — simplest
  sound undo story. Planner quality on real models untested (mocks only).
- `learnFromEdits` DB flow tested once with a temporary mocked-LLM run on seed data (not kept as a
  unit test; it needs a signed-in client).
- Trivial-trim check compares with the clip's original range, not the previous trim.
- Learn is called after every save (cheap count query; AI only at 25+ new events).
- `apps/web/.vitest/` appears after test runs (known from plan 6) — gitignore at merge.
- I accidentally created `apps/worker/seeds/agent.py.tmp` (content "x") in the MAIN checkout
  (not the worktree); deleting it was denied — please delete it.
