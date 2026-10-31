# Docs: docs/auth-and-keys.md
"""Server-wide Claude client for AI pipeline steps. Auth: CLAUDE_OAUTH_TOKEN (ADR 0007)."""

import os

import anthropic

CLAUDE_MODEL = "claude-opus-5-5"


def claude() -> anthropic.Anthropic:
    token = os.environ.get("CLAUDE_OAUTH_TOKEN")
    if not token:
        raise RuntimeError("CLAUDE_OAUTH_TOKEN is not set (apps/worker/.env)")
    # OAuth tokens go in `Authorization: Bearer` and need the oauth beta header.
    return anthropic.Anthropic(
        auth_token=token,
        default_headers={"anthropic-beta": "oauth-2025-04-20"},
    )
