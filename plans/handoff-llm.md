# Handoff: plan llm (feat/llm-adapter)

Commits: `b20e606` LLM adapter + keys/demo · `c45200f` transcription adapter · `675fafe` settings UI.
`pnpm check` and `pnpm test` pass (web 63, worker 76, schema 6). Not merged.

## What was built
- **LLM adapter** (raw HTTP, no SDKs), same contract in web `$lib/server/llm` and worker
  `worker/llm`: `generateText` / `generateJSON({ userId, task, schema, system, prompt })`,
  `maxInputTokens`, `AIError`. Task → tier → model via `packages/llm-registry/registry.json`
  (model ids checked 2026-10-31: claude-opus-5-5 / claude-haiku-5-5, gemini-4-argon /
  gemini-3.8-flash, openai/gpt-oss-120b / gpt-oss-20b). JSON: schema in prompt + native JSON
  mode, always validated, one repair retry. Errors: missing_key, invalid_key, rate_limited,
  overloaded, context_too_long, content_blocked, unknown; 2 retries for rate/overload.
- **Transcription adapter** `worker/transcription`: `transcribe(user_id, media_url)`; Deepgram
  (moved) and Groq Whisper (ffmpeg, overlapping chunks, midpoint dedupe, `speaker = null`).
- **Keys:** BYOK only (ADR 0008 supersedes 0007; `CLAUDE_OAUTH_TOKEN` + `claude()` helpers and the
  Anthropic SDKs removed). Demo exception: allowlisted verified emails (`DEMO_ALLOWED_EMAILS`) with
  no own key use `GEMINI_API_KEY` / `GROQ_API_KEY`, capped by `DEMO_DAILY_JOB_LIMIT` (default 10).
- **Guards/UI:** `requireAIKeys(userId, 'llm'|'transcription'|'both')` → 409 with
  "Add an AI provider key in Settings to use this."; on queue presign/create/retry/requeue/answer.
  `aiCapabilities()` → `page.data.ai` `{ llm, transcription, voice, demo }`; `<RequiresAI need=…>`
  disables a button with tooltip + "Add a key in Settings" (Queue Upload uses it).
- **Settings → AI providers:** 5 key rows, default + transcription provider, Advanced per-task
  overrides, 7-day usage, "Using shared demo keys" for demo users.
- Worker: an `AIError` in any step fails the job with its message (missing_key included); Retry
  after adding a key resumes at the step (unit tested).
- `pnpm check:ai` (in `pnpm check`), `pnpm gen:llm-registry`, `pnpm llm:smoke <user_id>`.

## Contracts for other plans
- AI calls: only `$lib/server/llm` / `worker.llm` / `worker.transcription`. New task name → add it
  to `packages/llm-registry/registry.json`, run `pnpm gen:llm-registry`.
- Gate every AI button with `<RequiresAI>` and every AI route with `requireAIKeys` (`docs/llm.md`,
  "Gating AI actions"). Plan 4 onboarding: treat `page.data.ai.demo` as "key step complete".
- **Plan 5:** steps can just raise/let `AIError` propagate. Transcript `speaker` may be `null`.
- Plan 7 voice: Wispr, else Groq Whisper through a server route in `$lib/server/llm` (hook documented).
- `formAction` now surfaces thrown `error(status, message)` messages.

## Migrations
`supabase/migrations/20261031170000_llm_adapter.sql` (idempotent): `key_provider` + `gemini`,
`ai_settings` (own rows), `llm_calls` (+ `key_source`; owner read). Applied to the shared DB via
psycopg (no `psql` on this machine), never `supabase db push`.

## Shared files touched
CLAUDE.md (repo map line), docs/INDEX.md, docs/env.md, both `.env.example`, app.d.ts
(`PageData.ai`), shell `+layout.server.ts` (loads `ai`), `form-action.ts`, `job-details.svelte`
(null speaker), `entities/job` Transcript type, root package.json scripts. New: docs/llm.md,
docs/deploy.md, ADR 0008. `main.py` untouched (AIError mapped in `pipeline.run`).

## Local env (gitignored, done in this worktree only)
Both worktree `.env` files: removed `CLAUDE_OAUTH_TOKEN`, added `DEMO_ALLOWED_EMAILS`,
`DEMO_DAILY_JOB_LIMIT`; worker `.env` got `GROQ_API_KEY` / `GEMINI_API_KEY` copied from web.
**Do the same in the main checkout's `.env` files after merging.**

## Checked here
Dev login (no keys, not allowlisted): Queue Upload disabled with tooltip + link; presign → 409 with
the exact message. Same user allowlisted via env: Settings shows "Using shared demo keys", Upload
enabled, presign 200. (A temporary `brand_profile` row for the dev user was added and removed.)

## Not done / known gaps
- No real provider call was made (running real keys was blocked here). Model ids and request
  shapes follow the docs; Gemini error bodies (bad-key 400, RetryInfo) and Groq
  `context_length_exceeded` are unconfirmed in current docs.
- Groq JSON uses `json_schema` with `strict: false`; if a schema is rejected, switch that provider
  to schema-in-prompt only (`providers.ts` / `providers.py`).
- Transcription calls are not written to `llm_calls`.

## Needs human
1. **Groq-only run:** sign in with Google (an account NOT on `DEMO_ALLOWED_EMAILS`) → Settings →
   save only a Groq key (status Valid) → Queue → upload a short video (e.g. the ffmpeg test clip in
   parallel-rules) → `pnpm worker:once job <id>` → job `done`, transcript provider `groq`, Speaker
   labels absent in details. Then `pnpm llm:smoke <user_id>` → `groq … ok` on both tiers.
2. **Claude + Deepgram run:** Settings → remove Groq, save a Claude key and a Deepgram key → upload →
   run the job → transcript provider `deepgram` with speakers. `pnpm llm:smoke <user_id>` →
   `anthropic … ok`. Set Default AI provider to Gemini (with a Gemini key), run smoke again: the
   newest `llm_calls` rows show `provider = gemini`.
3. **missing_key UI / 409:** with an account that has no keys and is not allowlisted: Queue →
   Upload disabled, hover shows "Add an AI provider key in Settings to use this.", link opens
   Settings; `curl` POST to `/queue?/presign` with that session → 409 + same message. Then in the
   worker: create a job, remove the key, run it → job `failed` with that message; add the key,
   press Retry → job runs.
4. **Demo users:** (a) Google account on `DEMO_ALLOWED_EMAILS` with no own keys → Settings shows
   "Using shared demo keys", upload + run works (`llm_calls.key_source = demo` once LLM steps
   exist), the 11th upload of the day gets the demo-limit message. (b) A non-allowlisted account
   with the server env keys set → still missing_key (UI + 409 + worker).
5. Set the Vercel env vars in `docs/deploy.md` (no `DEV_LOGIN` there); update the main checkout's
   `.env` files as above.

## Fix round (commits ef21124, 7169063, 1e05304)
1. Upload, create, retry, requeue and answer now require `'both'` (LLM + transcription). The
   Upload button uses `<RequiresAI need={['llm', 'transcription']}>`.
2. The demo cap now counts the append-only `demo_usage` table (user_id, kind, created_at). It has
   no FK to jobs and no client access. A row is written by `recordDemoJob` after a demo-keyed job
   is created. Migration: `supabase/migrations/20261031190000_llm_demo_usage.sql`, applied with
   psql. A test shows that deleting jobs doesn't free a slot.
3. `pnpm llm:smoke <user_id>` runs one `generate_text` and one `generate_json` per provider and
   tier through the real adapter path, and prints ok/FAIL for each. A unit test covers it, but it
   was not run against real providers.
4. Docs: applying migrations with psql is now the documented way (`docs/data-model.md`, the
   add-migration skill, `supabase/CLAUDE.md`, parallel-rules). psycopg is documented as the fallback.
5. The allowlisted account (DEMO_ALLOWED_EMAILS) has user_id `3af4ed6b-2029-4a50-8c74-1350dcdbd07f`.
   Demo smoke run: `pnpm llm:smoke 3af4ed6b-2029-4a50-8c74-1350dcdbd07f`. It uses that user's own
   keys if they have any, otherwise the demo Gemini key.
6. Dev login now marks its test user as onboarded, idempotently. It inserts a `brand_profile`
   row (`{"dev_login": true}`) without overwriting an existing one, and sets
   `profiles.onboarded_at` if it is null. It sits behind the same guard as the rest of dev login.
   When dev login is off, `devLogin()` writes nothing; the existing test now checks this.
   Verified: dev login now lands on `/queue` (200) instead of `/onboarding`. **Plan 4** must keep
   `completeOnboarding` in sync with its real onboarding gate (see docs/auth-and-keys.md).
