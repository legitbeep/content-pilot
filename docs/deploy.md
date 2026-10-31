---
covers:
  - apps/web/svelte.config.js
last_updated: 2026-11-01
---
# Deploy

The web app deploys to Vercel (adapter-vercel, Node runtime pinned in `svelte.config.js`;
project and URL in `docs/architecture.md`). The worker runs separately in Docker (`pnpm worker`).
Migrations are applied by the orchestrator with `npx supabase db push --include-all` on main.

## Vercel env vars
Set these in the Vercel project (Production and Preview). Meanings: `docs/env.md`.

| Var | Notes |
|---|---|
| `PUBLIC_SUPABASE_URL` | |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | |
| `SUPABASE_SECRET_KEY` | secret |
| `ENCRYPTION_KEY` | secret; same value as the worker, or saved keys can't be decrypted |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | secret; bucket CORS must allow `PUT` from the Vercel origin |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | secret |
| `YOUTUBE_REDIRECT_URI` | `https://<vercel domain>/settings/youtube/callback` |
| `DEMO_ALLOWED_EMAILS` | optional; empty disables the demo keys (ADR 0008) |
| `DEMO_DAILY_JOB_LIMIT` | optional; default 10 |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | secret; shared demo keys, only needed with `DEMO_ALLOWED_EMAILS` |
| `SKIP_ONBOARDING` | **temporary**; `true` skips the onboarding gate for testing. Unset it when plan10 removes the bypass |

**Never set `DEV_LOGIN` (or `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD`) on Vercel.** Production
builds ignore it anyway (`dev` is false), but it must not exist there.
No AI provider key other than the two demo keys belongs in Vercel: users bring their own.
