# Parallel work rules (read before anything else)

Several agents build features at the same time. Each runs in its own git worktree
and branch, but all share ONE Supabase database and ONE R2 bucket. These rules keep
the branches mergeable.

## Ownership

Only change what your plan owns. For everything else, read freely, but make only
additive changes (see rules 2 and 3).

| Plan | Branch | Owns |
|---|---|---|
| llm (wave 0) | feat/llm-adapter | lib/server/llm, worker/llm, transcription adapter, packages/llm-registry, llm_calls, AI providers settings, docs/llm.md. Frozen during waves 1-2: other plans use it, never change its interface; bug fixes found in real-key testing are allowed (call them out in your handoff) |
| 4 brand | feat/brand | brand_profile, brand_rules, entities/brand, onboarding + brand routes, docs/brand-memory.md |
| 5 clips | feat/clips | worker steps nsfw_check, brand_fit, extract_clips, cleanup_source; clip candidate columns; clip_feedback; clips picker route; docs/pipeline.md |
| 6 editor | feat/editor | packages/timeline-schema, timelines, edit_events, clip render columns, entities/timeline, widgets/editor, editor route, worker render loop; docs/timeline.md |
| 7 agent | feat/agent | lib/server/agent, features/editor-agent, voice input, edit-learning analyzer; docs/agent.md |
| 8 publish | feat/publish | platform_connections, posts, worker publisher loop, publish + calendar routes, Settings connections section; docs/publishing.md |
| 9 performance | feat/performance | post_metrics, post_checkpoints, baselines, feature_weights, change_log, home route, recommendations, LLM caption generator; docs/performance.md |

## Rules

1. **Migrations:** create new files only. Never edit an existing migration or one
   from another plan. Additive only (new tables, new nullable columns). Put the plan
   id in the name, e.g. `20261101120000_p6_timelines.sql`.
   - Migrations must be idempotent: `create table if not exists`,
     `add column if not exists`, `create index if not exists`,
     `drop policy if exists` before `create policy`, `create or replace` for
     functions and views.
   - On a feature branch, apply your migration to the shared DB with
     `psql "$DATABASE_URL" -f <file>` (no psql: psycopg fallback in docs/data-model.md).
     Never run `supabase db push` on a branch
     (it fails when the remote has other branches' migrations).
   - The orchestrator runs `npx supabase db push --include-all` on main after merging.
2. **Missing column on a table you don't own:** add it as nullable in your own
   migration and list it in your handoff note.
3. **Shared files** (docs/INDEX.md, docs/env.md, .env.example files, shortcuts.ts,
   sidebar nav, CLAUDE.md files, worker main.py): small append-only edits. Never
   reorganise them. The worker registers loops through one line per loop in main.py;
   put each loop's code in its own module under apps/worker/loops/.
4. **No waiting on other plans:** use seed data. Generate test media with ffmpeg,
   never download it, e.g.
   `ffmpeg -f lavfi -i testsrc2=size=1080x1920:rate=30 -f lavfi -i sine=frequency=440 -t 30 -c:v libx264 -c:a aac -shortest test.mp4`.
   Seed scripts are `pnpm seed:<plan>` and `pnpm seed:<plan>:clean`, idempotent, and
   tag rows (e.g. a `seed` marker) so cleanup removes exactly what they created.
5. **Contracts you can rely on:** the timeline JSON schema; core clip columns
   (id, job_id, user_id, file_path, duration, words, description, reasons);
   `buildMemoryContext(profile, rules, { scope, topics? })`; the LLM adapter
   (`generateText` / `generateJSON({ userId, task, schema, system, prompt })`) and
   `transcribe(userId, media_url)`. All AI calls go through these: never import a
   provider SDK (Anthropic, Gemini, Groq, Deepgram) directly; `pnpm check` enforces it.
   If you need a new task name, add it to the registry in your branch and list it in
   your handoff.
   If you change a contract you own, update docs + fixtures and call it out.
6. **Worktrees:** each plan works in `.worktrees/<plan>` (gitignored and ignored by
   all tools at the repo root). Use absolute paths; never edit files outside your worktree.
7. **Worker:** during parallel work never run long-lived worker loops (`pnpm worker`).
   Test with unit tests and `python -m worker.run_once <kind> <id>` on your own seed
   rows only. A plan that adds a loop kind (render, post, checkpoint) adds its branch
   to run_once.
8. **Dev login:** with `DEV_LOGIN=true` in your worktree's apps/web/.env and the dev
   server running, sign in as the test user via the dev login (docs/auth-and-keys.md)
   to check signed-in pages. Never use it in production code paths.
9. **Dev server port:** use the port given in your plan (`pnpm --filter web dev --port <n>`; `pnpm dev -- --port` does not forward the flag).
10. **Finish with a handoff note** at `plans/handoff-<plan>.md`: what was built,
   contracts added or changed, migrations, shared files touched, seed commands,
   known gaps. Commit on your branch. Do not merge; the human merges.
