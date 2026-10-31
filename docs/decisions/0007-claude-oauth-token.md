---
covers:
  - apps/web/src/lib/server/claude.ts
  - apps/worker/worker/claude.py
last_updated: 2026-10-31
---
# 0007 — Server-wide Claude OAuth token for AI steps

**Status:** accepted (supersedes the Anthropic part of 0004)

**Context.** Asking every user for an Anthropic key adds onboarding friction. The project owner
has a Claude OAuth token (`claude setup-token`) and has confirmed this use is permitted for them.

**Decision.** All AI steps (editor agent, brand fit, clip extraction) use one `CLAUDE_OAUTH_TOKEN`
from env, sent as a Bearer token with the `oauth-2025-04-20` beta header via a small `claude()`
helper in each app. Transcription and Wispr stay BYOK.

**Consequences.** No Claude key step in onboarding/settings. All usage and rate limits land on the
token owner's account; a revoked/expired token stops every AI step (re-run `claude setup-token`).
If that becomes a problem, swap the helper to `ANTHROPIC_API_KEY` — callers don't change.
