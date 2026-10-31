---
covers:
  - apps/web/src/lib/server/llm/keys.ts
  - apps/worker/worker/llm/keys.py
  - scripts/check-ai-imports.ts
last_updated: 2026-10-31
---
# 0008 — AI runs on the user's own keys (plus a demo allowlist)

**Status:** accepted (supersedes 0007)

**Context.** 0007 ran every AI step on one server-wide Claude OAuth token. That hides the "add a
key first" requirement, puts all usage on us, and subscription OAuth tokens aren't meant to power
a multi-user app. We still need a way to demo the product without asking judges for keys.

**Decision.** Every AI call (LLM and transcription) uses the signed-in user's own stored key
(BYOK: Claude, Gemini, Groq, Deepgram). No `CLAUDE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` or
`DEEPGRAM_API_KEY` exists in the app. One exception: if the user has no usable key for the
capability AND their verified email is in `DEMO_ALLOWED_EMAILS`, the server keys `GEMINI_API_KEY`
(LLM) and `GROQ_API_KEY` (transcription) are used, capped at `DEMO_DAILY_JOB_LIMIT` jobs/day.
Otherwise the call fails with `missing_key` ("Add an AI provider key in Settings to use this.").
The email is read server side (verified session in web, `auth.users` by user id in the worker),
never from the client. `scripts/check-ai-imports.ts` keeps the env var names out of every other file.

**Consequences.** Users must add a key before uploading (one Groq key covers everything). Demo
usage lands on the owner's Gemini/Groq accounts but only for listed emails; `llm_calls.key_source`
shows which key paid. Server keys never reach the browser, logs or Settings (not even last 4).
Details: `docs/llm.md`.
