# Docs: docs/llm.md
"""Provider HTTP errors -> AIError with the shared messages (worker/llm/errors.py)."""

import math

from worker.llm.errors import CLOUDFLARE_BLOCK, AIError


def http_error(provider: str, status: int, body: str, retry_after: str | None = None) -> AIError:
    """Provider HTTP error -> AIError with the shared messages. No retries here: the job's
    Retry button re-runs the step."""
    detail = f"{provider} HTTP {status}: {body[:2000]}"
    if status == 403 and CLOUDFLARE_BLOCK.search(body):
        name = "Deepgram" if provider == "deepgram" else "Groq"
        msg = f"{name} blocked the request at its network edge (not a key problem). Retry later."
        return AIError("unknown", provider, detail=detail, message=msg)
    if status in (401, 403):
        return AIError("invalid_key", provider, detail=detail)
    if status == 402:
        name = "Deepgram" if provider == "deepgram" else "Groq"
        msg = f"{name} says your account is out of credit."
        return AIError("unknown", provider, detail=detail, message=msg)
    if status == 429:
        ra = retry_after if retry_after and retry_after.replace(".", "").isdigit() else None
        ra = math.ceil(float(ra)) if ra else None
        return AIError("rate_limited", provider, ra, detail=detail)
    if status == 413:
        return AIError("context_too_long", provider, detail=detail)
    if status >= 500 or status == 498:
        return AIError("overloaded", provider, detail=detail)
    return AIError("unknown", provider, detail=detail)
