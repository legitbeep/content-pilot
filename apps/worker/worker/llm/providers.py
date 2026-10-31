# Docs: docs/llm.md
"""Raw HTTP per LLM provider (no SDKs): build the request, interpret the response. Mirror of
apps/web/src/lib/server/llm/providers.ts; both run packages/llm-registry/fixtures/responses.json."""

import json
import math
import re
from dataclasses import dataclass
from typing import Any


@dataclass
class CallRequest:
    key: str
    tier: dict  # {model, max_input_tokens, max_output_tokens}
    system: str
    prompt: str
    schema: dict | None = None  # JSON Schema → provider-native JSON mode (registry json_mode)


def build_request(provider: str, r: CallRequest) -> tuple[str, dict[str, str], dict]:
    """Returns (url, headers, json body)."""
    t = r.tier
    if provider == "anthropic":
        # JSON comes from instructions in `system`; the adapter validates and repairs.
        return (
            "https://api.anthropic.com/v1/messages",
            {"x-api-key": r.key, "anthropic-version": "2023-06-01"},
            {
                "model": t["model"],
                "max_tokens": t["max_output_tokens"],
                "system": r.system,
                "messages": [{"role": "user", "content": r.prompt}],
            },
        )
    if provider == "gemini":
        config: dict[str, Any] = {"maxOutputTokens": t["max_output_tokens"]}
        if r.schema:
            config["responseMimeType"] = "application/json"
        return (
            f"https://generativelanguage.googleapis.com/v1beta/models/{t['model']}:generateContent",
            {"x-goog-api-key": r.key},
            {
                "systemInstruction": {"parts": [{"text": r.system}]},
                "contents": [{"role": "user", "parts": [{"text": r.prompt}]}],
                "generationConfig": config,
            },
        )
    if provider == "groq":
        body: dict[str, Any] = {
            "model": t["model"],
            "max_completion_tokens": t["max_output_tokens"],
            "messages": [
                {"role": "system", "content": r.system},
                {"role": "user", "content": r.prompt},
            ],
        }
        if r.schema:
            # Best-effort (strict: false): strict mode rejects common schema shapes.
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "output", "schema": r.schema, "strict": False},
            }
        return (
            "https://api.groq.com/openai/v1/chat/completions",
            {"authorization": f"Bearer {r.key}"},
            body,
        )
    raise ValueError(f"unknown LLM provider {provider!r}")


BLOCKED_GEMINI = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"}


def _parse_ok(provider: str, b: dict) -> dict | None:
    if provider == "anthropic":
        if b.get("stop_reason") == "refusal":
            return None
        u = b.get("usage") or {}
        text = "".join(c["text"] for c in b.get("content") or [] if c.get("type") == "text")
        return {
            "text": text,
            "input_tokens": u.get("input_tokens", 0),
            "output_tokens": u.get("output_tokens", 0),
        }
    if provider == "gemini":
        c = (b.get("candidates") or [None])[0]
        if (b.get("promptFeedback") or {}).get("blockReason") or not c:
            return None
        if c.get("finishReason") in BLOCKED_GEMINI:
            return None
        u = b.get("usageMetadata") or {}
        parts = (c.get("content") or {}).get("parts") or []
        return {
            "text": "".join(p["text"] for p in parts if not p.get("thought") and "text" in p),
            "input_tokens": u.get("promptTokenCount", 0),
            "output_tokens": u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0),
        }
    if provider == "groq":
        c = (b.get("choices") or [None])[0]
        if not c or c.get("finish_reason") == "content_filter":
            return None
        u = b.get("usage") or {}
        return {
            "text": (c.get("message") or {}).get("content") or "",
            "input_tokens": u.get("prompt_tokens", 0),
            "output_tokens": u.get("completion_tokens", 0),
        }
    raise ValueError(f"unknown LLM provider {provider!r}")


def _retry_after(headers: dict[str, str], b: Any) -> int | None:
    try:
        h = float(headers.get("retry-after", ""))
        if h > 0:
            return math.ceil(h)
    except ValueError:
        pass
    details = ((b or {}).get("error") or {}).get("details") or [] if isinstance(b, dict) else []
    for d in details:
        if isinstance(d, dict) and d.get("retryDelay"):
            m = re.match(r"[\d.]+", d["retryDelay"])
            if m and float(m.group()) > 0:
                return math.ceil(float(m.group()))
    return None


TOO_LONG = re.compile(
    r"prompt is too long|context_length_exceeded|context length|maximum number of tokens"
    r"|too many tokens|reduce the length"
)
BAD_KEY = re.compile(r"api key not valid|api_key_invalid|invalid api key|invalid x-api-key")


def interpret(provider: str, status: int, headers: dict[str, str], body: Any) -> dict:
    """One HTTP response → {ok: True, text, input_tokens, output_tokens} or
    {ok: False, kind, retry_after}. `headers` keys are lowercase."""
    if 200 <= status < 300:
        parsed = _parse_ok(provider, body if isinstance(body, dict) else {})
        if parsed is None:
            return {"ok": False, "kind": "content_blocked", "retry_after": None}
        return {"ok": True, **parsed}
    text = json.dumps(body if body is not None else "").lower()

    def fail(kind: str, retry_after: int | None = None) -> dict:
        return {"ok": False, "kind": kind, "retry_after": retry_after}

    if status in (401, 403) or (status == 400 and BAD_KEY.search(text)):
        return fail("invalid_key")
    if status == 429:
        return fail("rate_limited", _retry_after(headers, body))
    if status == 413 or TOO_LONG.search(text):
        return fail("context_too_long")
    if status in (498, 502, 503, 504, 529):
        return fail("overloaded", _retry_after(headers, body))
    return fail("unknown")
