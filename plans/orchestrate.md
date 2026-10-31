# Orchestrator: build plan-llm and plans 4-10 with parallel subagents

You are the ORCHESTRATOR for this repo. You coordinate; subagents implement.
Your two jobs: keep the build moving wave by wave, and keep your own context small.

## Ground rules for you (the orchestrator)

1. **Don't read source code yourself.** Read only: CLAUDE.md, docs/INDEX.md,
   plans/parallel-rules.md, plans/STATUS.md, plans/handoff-*.md, and command output
   (git, pnpm check, pnpm test). If you need to know something about the code, send
   a subagent to find out and report back in under 150 words.
2. **plans/STATUS.md is your memory.** Create it in Step 0 and update it after every
   event (subagent started/finished, check passed/failed, merge done, human input
   needed). If your context is compacted or the session restarts, re-read
   STATUS.md first and continue from there.
3. **Subagents report briefly.** Every subagent ends with a summary of at most 200
   words; details go into its handoff file, not into your context.
4. **Stop for me only at the human checkpoints marked below,** or when something is
   blocked that you can't resolve in 2 fix rounds. When you stop, give a short
   numbered list of exactly what I need to do.

## Step 0: Check the starting state

1. Read CLAUDE.md, docs/INDEX.md, plans/parallel-rules.md, and only the first 5 lines
   of each plans/plan*.md (title + wave + branch). Subagents read full plans.
2. Run git status / branch / log. Confirm Prompt 3 (upload -> queue -> transcript)
   is committed on main. Check whether plan-llm or plan 4 already exist or are
   merged. If plan 4 was built before plan-llm, note in STATUS.md that it must be
   moved onto the adapter, and add that to plan-llm's Phase 3 item 5.
3. Create plans/STATUS.md with a table: plan, wave, branch, worktree, state
   (todo | running | needs-fix | ready-to-merge | merged | blocked), last note.

## Step 1: Wave 0 prep on main (do this yourself or with one subagent, then commit)

These changes make parallel work safe. Commit as "chore: parallel build prep".

1. **Worktrees inside the repo:** use `.worktrees/<plan>` (so subagents stay inside
   the project's allowed directories). Add `.worktrees/` to .gitignore and to every
   tool's ignore list (tsconfig exclude, ESLint, Prettier, ruff, pyright, svelte-check,
   docs check, Vitest). If your Claude Code version supports built-in worktree
   isolation for subagents, you may use that instead; note which in STATUS.md.
2. **Migrations without `db push` during parallel work.** Update
   plans/parallel-rules.md rule 1:
   - Migrations must be idempotent: `create table if not exists`,
     `add column if not exists`, `create index if not exists`,
     `drop policy if exists` before `create policy`, `create or replace` for
     functions and views.
   - While on a feature branch, apply your migration to the shared DB with
     `psql "$DATABASE_URL" -f <file>`. Never run `supabase db push` on a branch
     (it fails when the remote has other branches' migrations).
   - The orchestrator runs `npx supabase db push --include-all` on main after merging.
3. **Worker run-once mode:** add `python -m worker.run_once <kind> <id>` (kind: job,
   render, post, checkpoint as each exists) that processes exactly one item and
   exits. Add to parallel-rules: during parallel work, never run long-lived worker
   loops; test with unit tests and run_once on your own seed rows only.
4. **Dev login for agents:** add a dev-only email/password sign-in for a test user
   (created with the Supabase admin API), enabled only when `DEV_LOGIN=true` and the
   app runs in dev mode. It must not exist in production builds; add a test that
   proves it's disabled when the flag is off. Document in docs/auth-and-keys.md.
   This lets subagents check signed-in pages without Google OAuth.
5. **Permissions:** propose additions to .claude/settings.json so subagents can run
   unattended: pnpm, uv, docker compose, psql against DATABASE_URL, git
   (add/commit/worktree/status/diff/log) within .worktrees/. Show me the diff before
   saving it. **(Human checkpoint A: wait for my OK on the permissions diff.)**
6. Update plans/parallel-rules.md with items 2-4 and commit.

## Step 1b: Wave 0, the LLM adapter (single subagent, before any parallel wave)

Run plans/plan-llm.md with one subagent in `.worktrees/llm` on branch
feat/llm-adapter, using the same subagent brief as Step 2. Check it, then
**Human checkpoint A2:** ask me to test with my real keys (one Groq-only run and one
Claude + Deepgram run). Merge to main as in Step 3 before starting Wave 1. From then
on the adapter is frozen: Wave 1-2 subagents may add task names to the registry but
must not change the interface.

## Step 2: Run a wave

For each plan in the wave (Wave 1 = 4, 6, 8; Wave 2 = 5, 7, 9):

1. Create the worktree: `git worktree add .worktrees/<plan> -b <branch> main`.
   Copy apps/web/.env and apps/worker/.env into it (they're gitignored), add
   `DEV_LOGIN=true` to its web .env, and run `pnpm install` there.
2. Launch one subagent per plan **in parallel** with this brief:

   > You are implementing plans/plan<N>.md in the worktree at .worktrees/<plan>
   > (branch <branch>). Work only inside that folder; use absolute paths.
   > Read plans/parallel-rules.md, CLAUDE.md and docs/INDEX.md first, then only the
   > docs your plan lists. Don't explore the codebase beyond what those docs point to.
   > Before coding, write your implementation plan to plans/work-<plan>.md in the
   > worktree. Then implement phase by phase, committing after each phase. Run
   > `pnpm check` and `pnpm test` in the worktree after every phase and fix failures.
   > Apply migrations with psql as parallel-rules says. Use the dev login to check
   > signed-in pages. If a step needs a human (real Google sign-in, YouTube connect,
   > real API keys), skip it, and list it under "Needs human" in your handoff.
   > Finish by writing plans/handoff-<plan>.md and replying with a summary of at
   > most 200 words: done, not done, needs human, risks.

3. When a subagent returns: run `pnpm check && pnpm test` in its worktree yourself.
   - Pass -> state `ready-to-merge`.
   - Fail -> launch a fix subagent with only the failing output and the handoff file
     (max 2 fix rounds), then `blocked` if still failing.
4. **Human checkpoint B (end of each wave):** list every "Needs human" item from the
   handoffs as one numbered checklist, with which worktree and port to use. Wait until
   I confirm they pass or tell you what failed (then send a fix subagent).

## Step 3: Merge a wave

1. Merge branches into main one at a time, in plan-number order.
   - Conflicts in shared append-only files (docs/INDEX.md, env docs, shortcuts.ts,
     nav, worker main.py): keep both sides.
   - Any other conflict: send a subagent to resolve it, with both handoff files.
2. After each merge: `pnpm install && pnpm check && pnpm test` on main. Fix before
   merging the next branch.
3. After the whole wave: `npx supabase db push --include-all` (migrations are
   idempotent, so already-applied ones are safe), run each `pnpm seed:<plan>:clean`,
   then remove the wave's worktrees (`git worktree remove .worktrees/<plan>`).
4. Run the "no provider SDK outside adapters" check on main (part of pnpm check).
5. Ask a subagent to run the docs sync skill across the merged changes, then commit.
6. Update STATUS.md. Start the next wave from the updated main.

## Step 4: Wave 3

Run plans/plan10.md with a single subagent on branch feat/integration, then merge
it as above. Deploy steps that need accounts or dashboards go to me as the final
**human checkpoint C**, as one numbered checklist.

## Finish

Report: what's merged, final test status, STATUS.md summary, and any open risks.
