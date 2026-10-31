---
covers:
  - .env.example
  - docker-compose.yml
last_updated: 2026-10-31
---
# Environment variables

Template: `.env.example` (copy to `.env`, never commit). Worker gets it via `docker-compose.yml`
`env_file`. On Vercel set the web vars in project settings. Users' own API keys are **not** env
vars (BYOK, `docs/auth-and-keys.md`).

| Var | Used by | Purpose |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | web (browser-safe) | Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | web (browser-safe) | Anon key; RLS applies |
| `SUPABASE_SERVICE_ROLE_KEY` | web server, worker | Bypasses RLS: `user_keys`, `platform_connections` writes |
| `DATABASE_URL` | worker | Direct Postgres for `FOR UPDATE SKIP LOCKED` claims |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | web server, worker | Presign uploads (web); read/write video (worker) |
| `APP_ENCRYPTION_KEY` | web server, worker | AES-GCM key for BYOK keys + OAuth refresh tokens |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | web server, worker | YouTube OAuth (connect + token refresh; Data + Analytics APIs) |
| `YOUTUBE_REDIRECT_URI` | web server | OAuth callback URL |

Adding a var: add it to `.env.example` (placeholder + comment) and this table in the same change.
