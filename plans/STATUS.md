# Build status (orchestrator memory)

Start state (2026-10-31): Prompt 3 committed on main (02df6c2). plan-llm and plan 4 not built.
Plan files present: plan-llm, 4-10 (6, 8, 10 committed in acb5347).
Worktrees: manual `git worktree add .worktrees/<plan>` (not built-in isolation).
Parallelism cap: 3 subagents (Opus).

| plan | wave | branch | worktree | state | last note |
|---|---|---|---|---|---|
| prep | 0 | main | - | merged | committed 87c6da8 (check+test pass) |
| llm | 0 | feat/llm-adapter | .worktrees/llm | needs-fix | fix round a-d running; then merge (A2 deferred to checkpoint B) |
| 4 | 1 | feat/brand | .worktrees/brand | todo | |
| 6 | 1 | feat/editor | .worktrees/editor | todo | |
| 8 | 1 | feat/publish | .worktrees/publish | todo | |
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
