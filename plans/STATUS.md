# Build status (orchestrator memory)

Start state (2026-10-31): Prompt 3 committed on main (02df6c2). plan-llm and plan 4 not built.
Plan files present: plan-llm, 4-10 (6, 8, 10 committed in acb5347).
Worktrees: manual `git worktree add .worktrees/<plan>` (not built-in isolation).
Parallelism cap: 3 subagents (Opus).

| plan | wave | branch | worktree | state | last note |
|---|---|---|---|---|---|
| prep | 0 | main | - | merged | committed 87c6da8 (check+test pass) |
| llm | 0 | feat/llm-adapter | .worktrees/llm | merged | d400a60; main check+test pass; worktree removed; awaiting user db push |
| 4 | 1 | feat/brand | .worktrees/brand | merged | tests on main pending (option 2) |
| 6 | 1 | feat/editor | .worktrees/editor | merged | tests on main pending (option 2) |
| 8 | 1 | feat/publish | .worktrees/publish | merged | tests on main pending (option 2) |
| 5 | 2 | feat/clips | - | merged | f616ecb; check+test pass (web 94, schema 11, worker 132) |
| 7 | 2 | feat/agent | - | merged | eee4450; check+test pass (web 121, schema 11, worker 102) |
| 9 | 2 | feat/performance | - | merged | 478a654; check+test pass (web 104, schema 11, worker 114) |
| 10 | 3 | feat/integration | .worktrees/integration | in progress | Phase 1+2; no merge before user's prod results (checkpoint D) |

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

## Deferred to Checkpoint C (from Checkpoint B)
- (a) demo account glorytoharsh@gmail.com e2e (onboarding -> upload -> transcript).
- (c) Gemini default: llm:smoke rows provider = gemini (demo Gemini key hit quota).
- Publish/YouTube real post test (needs clips from plan 5).
- Editor audio upload test (needs clips from plan 5).

## Wave 2 rules (from user, carried into every brief)
1. Adapter interface frozen; bug fixes allowed, logged here.
2. AI UI actions use <RequiresAI>; AI routes use requireAIKeys.
3. Subagents never use demo server keys or user's real keys: worktree .env has GROQ/GEMINI/CLAUDE_OAUTH_TOKEN blanked, DEMO_ALLOWED_EMAILS empty. Mocks + seed only.
4. Own seed rows only (DB + R2). Worker via run_once only.
5. Migrations via psql, idempotent, prefixed p5_/p7_/p9_.
6. No real YouTube posting / Analytics API; plan 9 uses recorded fixtures. YOUTUBE_CLIENT_SECRET blanked in worktrees.
7. Dev server: pnpm --filter web dev --port <n> (5: 5173, 7: 5174, 9: 5175).
8. Dev login keeps working; each worktree uses its own DEV_LOGIN_EMAIL (dev-clips@ / dev-agent@ / dev-perf@clip-studio.test).

## Wave 2 overlap + ownership (decided 2026-11-01)
Shared surfaces and the single owner of each:
- **brand_rules learned candidates (7 + 9 write, 5 reads via memory):** plan 7 owns the learned-rule
  lifecycle + docs/brand-memory.md "Learned rules"/"Conflicts" sections + the review UI on /brand
  ("Learned from you" tab, reusing plan 4's Regenerate tick-box diff: only ticked candidates become
  active, unticked can be dismissed -> archived). Per user brief + hard rule 4, learners NEVER set
  status active; they only insert/update `candidate` rows (evidence_count +1, append evidence). The
  "3+ -> active + toast" in plan7/plan9 text becomes "3+ -> highlighted as ready in review + toast".
  Extension point for plan 9: write `brand_rules` rows directly from Python with
  `status='candidate', source='performance'`, `evidence` items `{kind:'performance', post_id, feature, verdict}`;
  dedupe by matching an existing candidate with the same `evidence[0].feature` + verdict. Plan 9
  appends one subsection to brand-memory.md; never edits plan 7's sections or the /brand route.
- **clip_feedback (5 writes, 7 reads):** plan 5 owns. Contract fixed now: `clip_feedback(id uuid pk,
  user_id, clip_id, job_id, decision text check in ('approved','rejected'), reason text null,
  created_at)`, owner RLS. Plan 5 applies this migration to the shared DB FIRST (before Phase 1)
  so plan 7 can seed rows. Plan 7 never creates it.
- **clips.features / ranking_score + apply_weights (5 calls, 9 implements):** plan 5 owns the columns
  and writes `features = {topic, length_bucket: short(<=30s)|medium(<=60s)|long, hook_type}`. Plan 9 owns
  `apps/worker/ranking.py`: `apply_weights(user_id: str, candidates: list[dict]) -> list[dict]`
  (each candidate has `scores` + `features`; returns them ordered with `ranking_score` set; loads
  feature_weights itself; does the 15% exploration). Plan 5 creates the same file as a stub
  (ranking_score = mean of scores, sort desc). At merge: add/add conflict -> take plan 9's file.
  feature_weights keys: `topic:<x>`, `length:<bucket>`, `hook:<type>`.
- **edit_events (6 owns; 7 reads+writes agent events; 9 writes caption edits):** no new columns
  from either. Plan 9 writes caption edits as `op='caption_edit'`, `source='manual'`, `clip_id`,
  `args={platform, before, after}`; plan 7's analyzer reads them. If op has a CHECK constraint,
  plan 9 relaxes it in its own p9_ migration and notes it in the handoff.
- **buildMemoryContext:** plan 4 owned, read-only for all three (5: clip_selection on job confirm
  -> jobs.memory_snapshot; 7: editing; 9: copy). No changes; no Python port.
- **LLM registry/prompts:** all needed tasks already exist (moderate_text, brand_fit, extract_clips,
  understand_request, plan_edits, learn_rules, captions, recommendations). Each plan keeps its
  prompts in its own module; registry edits append-only. `learn_rules` used by 7 and 9 with
  separate prompts.
- **jobs columns (memory_snapshot, user_intent):** plan 5 only (nullable, p5_ migration).
- **Shared append-only files:** docs/INDEX.md, docs/data-model.md, docs/env.md, .env.example,
  shortcuts.ts (plan 7 only), sidebar nav, worker main.py (plan 9 adds checkpoints loop line),
  run_once (plan 9 adds `checkpoint`), worker pipeline step list (plan 5 owns).
- **Wave-1 code touched:** Queue UI needs_input sheet + done->picker link (5); /brand route (7);
  YouTube OAuth callback, publisher posted hook, CaptionGenerator, Home (9); editor agent slot (7).
**Merge order:** 5 -> 9 -> 7 (9 replaces 5's apply_weights stub; 7 consumes 5's clip_feedback and
9's caption_edit events + performance candidates in its review UI).

## Wave 3 rules (from user, 2026-11-01)
1. No merge of feat/integration until user sends production test results; their bug list is fixed on feat/integration in Phase 1.
2. No hotfixes on main unless user says "hotfix"; then fix on main and rebase feat/integration.
3. Never start the long-running worker or any worker container (user's laptop worker serves prod). run_once on own seed rows only.
4. No demo server keys or user's keys; mocks + seed only.
5. Phase 2: prepare scripts/deploy-worker.sh + docs/deploy.md only; user runs everything on VM/Vercel/Supabase.
6. Phase 1+2 done + checks pass in worktree -> stop at checkpoint D, wait for prod results; then fix, merge, final deploy checklist.
Note: plans/plan10.md on main still says Oracle Cloud/HF Spaces; user says target is a Google Cloud VM -> follow user.

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
- User chose option 2: merge Wave 1 now, run checkpoint B tests on main in parallel with Wave 2. YouTube OAuth client created; env files + Vercel vars set.
- Merged 4 (c849313), 6 (68efb7b, r2.ts+data-model conflicts resolved by orch), 8 (e799ee7, 10-file conflict resolved by subagent). Main: check pass, web 90, schema 11, worker 98. Waiting on user db push (p4, p6, p8 migrations).
- User ran db push for wave 1. User browser-testing main before Wave 2: HOLD Wave 2 launch until user says go. Seed cleanup/worktree removal deferred (seeds useful for testing).
- Gemini demo: only 3 llm_calls ever, all stated_rules on gemini-4-argon (high tier), all rate_limited on first try -> quota issue on the key/model tier, not overuse.
- User wants to test on Vercel prod + temporary onboarding bypass (SKIP_ONBOARDING, removal item added to plan10). Bypass subagent running. Prod deploy (CLI only, no git remote) is ~2h old = pre-Wave-1. Vercel env: YOUTUBE_REDIRECT_URI missing, CLAUDE_OAUTH_TOKEN obsolete.
- Bypass committed 94b6128 (check+test pass). Waiting on user yes for prod deploy.
- Prod deploy failed via npm install (workspace:* deps); deployed prebuilt instead: from apps/web `vercel pull --yes --environment production && vercel build --prod && vercel deploy --prebuilt --prod`. Prod live at main 94b6128+. SKIP_ONBOARDING + YOUTUBE_REDIRECT_URI set on Vercel. Worker running natively (uv run python main.py, bg) — Homebrew ffmpeg lacks libass so burned captions skipped. TODO plan10: fix Vercel git/remote build for pnpm workspace (root dir apps/web + root upload).
- Job c0325709 (demo user) failed at transcribe: Groq 403 'error code: 1010' = Cloudflare blocking urllib default UA (verified: custom UA -> 200). Fix subagent running (UA header + don't map CF 403 to bad key). Then restart worker, user retries. Seed post 4f609355 failed invalid_grant (fake seed token, expected).
- UA fix bfabc02 (check+test pass). Worker restarted with fix. Web redeploy for fix denied by auto-mode (prod deploy) -> user to run it.
- Docker DNS fixed (dns 1.1.1.1/8.8.8.8 in compose); worker now runs in Docker (docker compose up -d worker), libass available. Deferred by user: publish/YouTube test and editor audio upload (need clips from plan 5); groq-only accepted as enough for now.
- Web redeployed with UA fix (prod = main incl. bfabc02 + DNS commit).
- Wave 2 preconditions checked (main d291f6f): 4/6/8 merged in order, check+test pass (web 93, schema 11, worker 102), db push done. FAIL: Wave 1 worktrees still present (clean, merged); Checkpoint B open items not yet listed as deferred to C. Stopped, asked user.
- Wave 1 worktrees removed. Wave 2 worktrees created (clips/agent/performance from d291f6f), env sanitized (no demo/real AI keys, no YouTube secret), deps installed.
- Wave 2 subagents launched in parallel: 5 (clips, 5173), 7 (agent, 5174), 9 (performance, 5175).
- Plan 7 done (eee4450). Orch re-ran check+test in worktree: pass (web 121, schema 11, worker 102). All AI mock-only. Risk: learn-rules DB flow has no permanent test. Stray 1-byte apps/worker/seeds/agent.py.tmp left in MAIN checkout by subagent (its rm was denied) -> left for user.
- Plan 9 done (478a654). Orch re-ran check+test: pass (web 104, schema 11, worker 114). Deviations: hand-built charts (no layerchart dep), rule text templated (learn_rules unused), ratings stored not weighted, 14d checkpoint kept. YOUTUBE_FAKE opt-in (default off, documented dev-only). p9 migration also adds clips.features if not exists (no-op). Touched $lib/server/youtube.ts (reconnect resets baselines). Merge: take p9 ranking.py.
- Plan 5 done (f616ecb). Orch re-ran check+test: pass (web 94, schema 11, worker 132). NSFW model Falconsai (Apache-2.0, ONNX int8) via ADD --checksum; Docker build not run. Main's Docker worker (old code) claimed a dev-clips seed job; seed leaves 2 placeholder `processing` jobs for dev-clips user to block it (removed by seed:clips:clean). nsfw_check ~15-20 min per 60-min video on CPU. Picker shortcuts page-local.
- All 3 Wave 2 plans ready-to-merge. No new required env vars (optional: NSFW_MODEL_PATH, YOUTUBE_FAKE dev-only; Wispr is a per-user Settings key). Checkpoint C issued; waiting on user results. Merge order 5 -> 9 -> 7.
- User: test Wave 2 on prod instead; checkpoint C deferred to after deploy. Tagged pre-wave2 (561662a, local).
- Merged 5 (check+test pass: web 94, schema 11, worker 132). Merged 9: conflicts main.py/run_once.py/env.md/package.json kept both; ranking.py took p9's. check pass; test FAIL 2 worker tests in plan 5's tests/test_extract_clips.py: test_ranking_stub_mean_desc (asserts the old stub) + test_run_cuts_uploads_and_writes_rows (fake DB doesn't answer p9's feature_weights query -> KeyError 'feature'). Test-side only. STOPPED per user, plan 7 not merged.
- User OK'd test fix: f0d9898 (stub test replaced by test_run_ranks_with_learned_weights; FakeConn returns zero weight rows -> default ranking; load_weights skips+logs malformed rows, tested). Main pass (worker 145).
- Merged 7 (data-model.md + package.json conflicts kept both). Main: check pass, web 133, schema 11, worker 145.
- Seed cleans run: clips (5 jobs incl 2 placeholder processing), agent (1 job, 3 clips, 3 rules), performance (1 job, 10 posts, 6 rules), editor (1 job), publish (1 job, 3 renders). All dev-*@clip-studio.test users now 0 jobs/clips/posts. Left: dev-brand 8 rules + R2 brand/<dev-brand>/logo.png (plan 4, UI-made, no seed clean). R2 total 4 objects.
- Safety: main .env files have no YOUTUBE_FAKE/DEV_LOGIN. DEV_LOGIN already `dev &&` guarded. YOUTUBE_FAKE was runtime-only -> eca5a82: web `dev &&` guard, worker ignores it in Docker (/.dockerenv); tests added. Main: check pass, web 134, worker 146.
- docker compose build worker on main: OK; nsfw.onnx sha256 matches, onnxruntime loads it; yt_stats.fake() False inside image even with YOUTUBE_FAKE=true. Running worker container still old image (not restarted).
- Env diff vs last deploy (d291f6f): only YOUTUBE_FAKE (web+worker, dev-only, don't set) and NSFW_MODEL_PATH (worker, optional). No new required vars.
- Wave 2 worktrees removed; stray agent.py.tmp deleted. WAVE 2 MERGED. Checkpoint C moved to production testing after deploy. Waiting on user: db push (p5, p7, p9 migrations), web deploy, worker restart.
- Wave 3 start: worktree .worktrees/integration (feat/integration from main 700f20d), env sanitized (AI keys, DEMO_ALLOWED_EMAILS, YOUTUBE_CLIENT_SECRET blank; DEV_LOGIN_EMAIL=dev-integration@clip-studio.test), deps installed. Plan 10 subagent launched.
