---
covers:
  - apps/web/.env.example
  - apps/worker/.env.example
  - docker-compose.yml
  - .gitleaks.toml
  - .gitleaksignore
  - scripts/check-secrets.sh
last_updated: 2026-11-01
---
# Environment variables

Each app has its own env file: copy `apps/web/.env.example` → `apps/web/.env` and
`apps/worker/.env.example` → `apps/worker/.env` (both gitignored, never commit). Vite/SvelteKit
reads `apps/web/.env`; the worker container gets `apps/worker/.env` via `docker-compose.yml` (which also pins DNS to 1.1.1.1 / 8.8.8.8, because Docker's default resolver failed locally)
`env_file`. On Vercel, set the web vars in project settings (`docs/deploy.md`). Users' AI keys are **not** env
vars (BYOK, ADR 0008). The only AI keys in env are the shared **demo** keys, used solely for
allowlisted accounts (`docs/llm.md`). `ANTHROPIC_API_KEY`, `CLAUDE_OAUTH_TOKEN` and
`DEEPGRAM_API_KEY` must not exist in app code (`pnpm check:ai`).

## apps/web/.env

| Var | Where | Purpose |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Publishable key (`sb_publishable_…`); RLS applies |
| `SUPABASE_SECRET_KEY` | **server only** | Secret key (`sb_secret_…`), bypasses RLS: `user_keys`, `platform_connections` writes. Lint fails if a client-reachable module references it |
| `ENCRYPTION_KEY` | server | AES-GCM key (base64, 32 bytes) for BYOK keys + OAuth refresh tokens. Same value as worker |
| `DEMO_ALLOWED_EMAILS` | **server only** | Comma-separated verified emails that may use the shared demo keys when they have no own key. Same value as worker. Empty = no demo |
| `DEMO_DAILY_JOB_LIMIT` | server | Jobs per UTC day for a demo user on the shared keys (default 10) |
| `GEMINI_API_KEY` | **server only** | Shared demo LLM key (allowlisted users only, never sent to the browser). Read only in `$lib/server/llm/keys.ts` |
| `GROQ_API_KEY` | **server only** | Shared demo transcription key (same rules). Read only in `$lib/server/llm/keys.ts` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | server | Presign browser uploads, HEAD/GET/DELETE objects. The bucket needs a CORS rule allowing `PUT` from the web origin(s) with any header |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | server | YouTube connect OAuth |
| `YOUTUBE_REDIRECT_URI` | server | YouTube OAuth callback URL |
| `YOUTUBE_FAKE` | server, **dev only** | `true` = Home recommendations read YouTube search/trending from recorded fixtures (`docs/performance.md`). Ignored outside `vite dev` (`dev &&` guard), so a production build can't use it |
| `DEV_LOGIN` | server, **dev only** | `true` enables `/auth/dev-login` (test-user sign-in for agents) under `vite dev`. Ignored in production builds |
| `DEV_LOGIN_EMAIL`, `DEV_LOGIN_PASSWORD` | server, dev only | Test user credentials. Defaults `dev@clip-studio.test` / `dev-login-password`. See `docs/auth-and-keys.md` |

Web code reads public vars through `$env/dynamic/public` (so a missing `.env` doesn't break
`pnpm check`) and private vars only from `$lib/server` / `*.server.ts` / `+server.ts`.

## apps/worker/.env

| Var | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Secret key; bypasses RLS |
| `DATABASE_URL` | Postgres for `FOR UPDATE SKIP LOCKED` claims. Use the Session pooler string from Supabase → Connect if your network has no IPv6 (the direct `db.` host is IPv6-only) |
| `WORKER_CONCURRENCY` | Jobs processed at once (threads), default 1. Per-user cap of 2 is in the claim query |
| `ENCRYPTION_KEY` | Same value as web; decrypts BYOK keys + refresh tokens |
| `DEMO_ALLOWED_EMAILS`, `DEMO_DAILY_JOB_LIMIT` | Same values as web; the worker checks the job owner's email in `auth.users` |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | Shared demo keys (allowlisted users only). Read only in `worker/llm/keys.py` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Read sources, write renders |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | Token refresh, uploads, stats (Data + Analytics APIs) |
| `NSFW_MODEL_PATH` | Optional. NSFW image model file; default `apps/worker/models/nsfw.onnx` (baked into the Docker image, `pnpm nsfw:model` locally; `docs/pipeline.md`) |
| `YOUTUBE_FAKE` | Dev/test only: `true` answers YouTube stats reads from recorded fixtures (`docs/performance.md`). `pnpm checkpoints:run-now` / `seed:performance` set it. Ignored inside the Docker image (`/.dockerenv`), so the production worker can't use it |

Adding a var: add it to the right `.env.example` (placeholder + comment) and this doc in the same change.

## Secret scanning
`pnpm check` runs `scripts/check-secrets.sh`: gitleaks over staged and uncommitted changes only
(skips with a warning if gitleaks isn't installed). `.gitleaks.toml` extends the default rules
with a Postgres-URL-password rule; `.gitleaksignore` lists known rotated or test-only findings
by fingerprint. Full-history scan: `gitleaks git --redact .`.
