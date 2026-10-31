---
covers:
  - apps/web/.env.example
  - apps/worker/.env.example
  - docker-compose.yml
last_updated: 2026-10-31
---
# Environment variables

Each app has its own env file: copy `apps/web/.env.example` → `apps/web/.env` and
`apps/worker/.env.example` → `apps/worker/.env` (both gitignored, never commit). Vite/SvelteKit
reads `apps/web/.env`; the worker container gets `apps/worker/.env` via `docker-compose.yml`
`env_file`. On Vercel, set the web vars in project settings. Users' own transcription/Wispr keys are **not** env
vars (BYOK, `docs/auth-and-keys.md`); Claude is the one server-wide AI credential (ADR 0007).

## apps/web/.env

| Var | Where | Purpose |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Publishable key (`sb_publishable_…`); RLS applies |
| `SUPABASE_SECRET_KEY` | **server only** | Secret key (`sb_secret_…`), bypasses RLS: `user_keys`, `platform_connections` writes. Lint fails if a client-reachable module references it |
| `ENCRYPTION_KEY` | server | AES-GCM key (base64, 32 bytes) for BYOK keys + OAuth refresh tokens. Same value as worker |
| `CLAUDE_OAUTH_TOKEN` | **server only** | Claude OAuth token (`claude setup-token`) for the editor agent. Same value as worker |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | server | Presign browser uploads |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | server | YouTube connect OAuth |
| `YOUTUBE_REDIRECT_URI` | server | YouTube OAuth callback URL |

Web code reads public vars through `$env/dynamic/public` (so a missing `.env` doesn't break
`pnpm check`) and private vars only from `$lib/server` / `*.server.ts` / `+server.ts`.

## apps/worker/.env

| Var | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Secret key; bypasses RLS |
| `DATABASE_URL` | Direct Postgres for `FOR UPDATE SKIP LOCKED` claims |
| `ENCRYPTION_KEY` | Same value as web; decrypts BYOK keys + refresh tokens |
| `CLAUDE_OAUTH_TOKEN` | Claude OAuth token for AI pipeline steps (brand fit, clip extraction). Same value as web |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Read sources, write renders |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | Token refresh, uploads, stats (Data + Analytics APIs) |

Adding a var: add it to the right `.env.example` (placeholder + comment) and this doc in the same change.
