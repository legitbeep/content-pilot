# Build status (orchestrator memory)

Start state (2026-10-31): Prompt 3 committed on main (02df6c2). plan-llm and plan 4 not built.
Plan files present: plan-llm, 4-10 (6, 8, 10 committed in acb5347).
Worktrees: manual `git worktree add .worktrees/<plan>` (not built-in isolation).
Parallelism cap: 3 subagents (Opus).

| plan | wave | branch | worktree | state | last note |
|---|---|---|---|---|---|
| prep | 0 | main | - | merged | committed 87c6da8 (check+test pass) |
| llm | 0 | feat/llm-adapter | .worktrees/llm | merged | d400a60; main check+test pass; worktree removed; awaiting user db push |
| 4 | 1 | feat/brand | .worktrees/brand | ready-to-merge | 88033e7; check+test pass (orch verified, web 69) |
| 6 | 1 | feat/editor | .worktrees/editor | ready-to-merge | 3e1cf47; check+test pass (orch verified, schema 11, web 79, worker 91) |
| 8 | 1 | feat/publish | .worktrees/publish | ready-to-merge | 0385bab; check+test pass (orch verified, web 72, worker 84) |
| 5 | 2 | feat/clips | .worktrees/clips | todo | |
| 7 | 2 | feat/agent | .worktrees/agent | todo | |
| 9 | 2 | feat/performance | .worktrees/performance | todo | |
| 10 | 3 | feat/integration | - | todo | |

## Decisions (2026-10-31, from user)
1. Permissions: allow pnpm, uv, docker compose, ffmpeg/ffprobe, psql, git add/commit/status/diff/log/worktree. Blocked: git push, supabase db push, git reset --hard, git clean, rm outside repo.
2. `npx supabase db push` stays blocked for agents. After each wave merge: stop, ask user to run `npx supabase db push --include-all`, continue on confirm.
3. DB password rotated; local .env updated. Add secret scanner (gitleaks) to `pnpm check`, scan full history once, report findings (no values).
4. Prod web: https://clip-studio-pi.vercel.app. Google login works there + locally. Supabase redirects: Vercel URL + localhost 5173/5174/5175.
5. plan6/8/10 committed in plans/.
6. Order: plan-llm (Wave 0 alone) -> Wave 1 (4, 6, 8) -> Wave 2 (5, 7, 9) -> Wave 3 (10). Plan 4 was NOT started before plan-llm, so no adapter move needed.

7. (later) Checkpoint A2 deferred until plan 4 is merged (placeholder onboarding blocks sign-in). Fixes before llm merge: upload guard 'both'; demo cap from record surviving job deletion; llm:smoke runs generateJSON per provider; dev-login test user gets completed onboarding (dev-only, DEV_LOGIN guard; plan 4 must keep it working).
8. Freeze rule: after llm merge the adapter interface is frozen; bug fixes found in real-key testing are allowed.
9. Checkpoint B (end of Wave 1) checklist must include deferred A2, in order: (a) demo account glorytoharsh@gmail.com, no own keys: onboarding -> upload -> transcript; (b) second account, Groq key only: onboarding -> upload -> Groq transcript; llm:smoke ok incl JSON; (c) same account, Gemini default: llm:smoke rows provider = gemini; (d) no keys: upload disabled with tooltip + Settings link. Skip Claude + Deepgram.
10. psql installed (brew libpq): psql is primary for migrations, psycopg kept as fallback.

## Decisions (2026-10-31, resume)
7. Permissions in .claude/settings.json are final (denied: pnpm dlx, git push, git reset --hard, git clean, supabase db push/link, rm outside repo).
8. AI keys: users' own keys only, except demo allowlist (DEMO_ALLOWED_EMAILS, currently glorytoharsh@gmail.com) using server GROQ_API_KEY + GEMINI_API_KEY with daily job cap. ADR 0008 (on feat/llm-adapter).
9. psql is installed and connects; use it for migrations (supersedes psycopg note).
10. Checkpoint A2 DEFERRED to Wave 1 checkpoint B (needs onboarding, plan 4). After plan-llm merges the adapter interface is frozen; bug fixes from real-key testing allowed. A2 items for checkpoint B: demo account e2e; Groq-only e2e + llm:smoke incl JSON; Gemini default (llm_calls shows gemini); no keys -> upload disabled. Skip Claude + Deepgram.
11. Dev login test user must have a completed brand_profile (dev-only, DEV_LOGIN guard) so subagents reach signed-in pages. Plan 4 must keep this working.
12. Worker runs locally until plan 10 deploys it.

## Log
- Step 0 done. Step 1 prep launched.
- Checkpoint A (permissions diff) pending user OK.
- Note: .claude/settings.json denies `npx supabase db push`; orchestrator's post-merge push needs human or deny removal.
- Prep committed 87c6da8. Leaked DB password found in worker .env.example (history, commit 6dbaf5e) -> placeholder; user must rotate.
- llm worktree created + deps installed. Subagent launch denied by auto-mode classifier; waiting on user.
- Settings.json approved + committed with secret scanning (12be9a7). Full-history gitleaks: 2 findings (rotated DB pw in 6dbaf5e via custom postgres rule; test key in fixtures/crypto.json), both fingerprinted in .gitleaksignore.
- llm worktree ff'd to 12be9a7, rotated .env copied, DEV_LOGIN=true. plan-llm subagent launched.
- User added 5 plan-llm requirements (missing_key error, BYOK-only no env fallback -> supersedes ADR 0007, requireAIKeys 409 guard, client capability helper + disabled AI actions, worker missing_key fail/retry). Included in subagent brief.
- User: ADR 0007 replaced by user-keys + demo allowlist (DEMO_ALLOWED_EMAILS, DEMO_DAILY_JOB_LIMIT, key_source), docs/deploy.md Vercel env section. Sent to running subagent. Keep gitleaks allow.
- Scanner test: staged fake postgres URL + api key -> 2 leaks, pnpm check exit 1; file removed.
- plan-llm done (4 commits, ec72f2f). Orchestrator re-ran check+test in worktree: pass (web 63, schema 6, worker 76). Migration applied via psycopg (psql not installed). Risks: Groq JSON mode untested, plan 5 must switch upload guard to 'both', deleting jobs frees demo cap. Checkpoint A2 pending.
- Resumed (new session). llm branch at 737c3e2 has fix round; decision 11 still missing. Status report to user, awaiting OK.
- llm fix round done (1829d9d). Merged to main d400a60; check pass, tests web 65 / schema 6 / worker 77. DEMO_* vars copied to main .env files. Demo user_id 3af4ed6b-2029-4a50-8c74-1350dcdbd07f. Waiting on user: npx supabase db push --include-all.
- User ran db push (2 llm migrations applied). Docs sync subagent launched.
- Docs sync fbb6c06 (architecture.md, queue.md). Wave 1 worktrees created from main; 3 subagents launched.
- Plan 4 done (88033e7). Risks: existing accounts without onboarding_completed_at see onboarding once; no Python buildMemoryContext yet (plan 5 worker needs it -> tell plan 5); Settings key actions moved to $lib/server/keys.ts (merge-conflict risk with llm-owned settings). Demo Gemini key hit rate limit during testing.
- Plan 8 done (0385bab). Added nullable clips.render_path/render_status(text)/description on shared DB; told plan 6 subagent to reconcile render_status type. Worker YOUTUBE_CLIENT_ID/SECRET got invalid_client (user to check). Upload code only fake-tested.
- Plan 6 done (3e1cf47). Timeline v2 (plan 5 must write v2). render_status text+CHECK, matches plan 8. Untracked apps/web/.vitest/ -> gitignore at merge. Port flag: use `pnpm --filter web dev --port N` (fix parallel-rules rule 9 at merge). Docker DNS broken (workaround --dns 1.1.1.1 / compose dns).
- Checkpoint B issued to user (A2 a-d, brand, publish, editor items). Waiting.
