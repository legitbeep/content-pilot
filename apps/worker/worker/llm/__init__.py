# Docs: docs/llm.md
"""The ONE LLM interface for worker code. Callers name a task, never a model or provider:
    generate_text(user_id=, task=, system=, prompt=)
    generate_json(user_id=, task=, schema=<pydantic model>, system=, prompt=)
Mirror of apps/web/src/lib/server/llm. Never import a provider SDK or call a provider API elsewhere.
Returns {data, provider, model, usage: {input_tokens, output_tokens}, latency_ms}."""

import json
import re
import time
import urllib.error
import urllib.request
from typing import Any

from pydantic import BaseModel, ValidationError

from worker import db
from worker import keys as user_keys

from .errors import MISSING_KEY_MESSAGE, AIError
from .keys import key_for, load_user_ai, resolve_llm
from .providers import CallRequest, build_request, interpret
from .registry import model_for, provider_name

__all__ = ["MISSING_KEY_MESSAGE", "AIError", "generate_json", "generate_text", "max_input_tokens"]

MAX_RETRIES = 2  # rate_limited / overloaded
MAX_WAIT_S = 20  # a longer retry-after fails fast with the readable message instead
_sleep = time.sleep  # test seam


def _http(url: str, headers: dict[str, str], body: dict) -> tuple[int, dict[str, str], str]:
    """POST JSON. Test seam: tests monkeypatch this."""
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            return res.status, {k.lower(): v for k, v in res.headers.items()}, res.read().decode()
    except urllib.error.HTTPError as e:
        hdrs = {k.lower(): v for k, v in e.headers.items()}
        return e.code, hdrs, e.read().decode(errors="replace")


def generate_text(*, user_id: str, task: str, system: str, prompt: str) -> dict:
    return _run(user_id, task, system, prompt, None)


def generate_json(
    *, user_id: str, task: str, schema: type[BaseModel], system: str, prompt: str
) -> dict:
    return _run(user_id, task, system, prompt, schema)


def max_input_tokens(user_id: str, task: str) -> int:
    """Input budget for the provider this task would use now. Long inputs must chunk to fit."""
    r = resolve_llm(load_user_ai(user_id), task)
    if not r:
        raise AIError("missing_key")
    return model_for(r["provider"], task)["max_input_tokens"]


def _run(
    user_id: str,
    task: str,
    system: str,
    prompt: str,
    schema: type[BaseModel] | None,
    resolved: dict | None = None,  # forced {provider, source}: only `pnpm llm:smoke` passes it
):
    resolved = resolved or resolve_llm(load_user_ai(user_id), task)
    if not resolved:
        raise AIError("missing_key")
    provider = resolved["provider"]
    tier = model_for(provider, task)
    started = time.monotonic()
    usage = {"input_tokens": 0, "output_tokens": 0}

    def log(ok: bool, error_kind: str | None = None) -> None:
        src = resolved["source"]
        _log_call(user_id, provider, src, tier["model"], task, usage, started, ok, error_kind)

    try:
        req = CallRequest(key=key_for(user_id, resolved), tier=tier, system=system, prompt=prompt)
        if schema is None:
            data: Any = _send(provider, req, usage)
        else:
            req.schema = schema.model_json_schema()
            req.system += (
                "\n\nReply with only a JSON value (no prose, no code fences) matching this "
                f"JSON Schema:\n{json.dumps(req.schema)}"
            )
            text = _send(provider, req, usage)
            data, err = parse_json(text, schema)
            if err:
                # One repair attempt with the validation error, then give up readably.
                req.prompt = (
                    f"{prompt}\n\nYour previous reply was not valid: {err}\nPrevious reply:\n"
                    f"{text}\n\nReply again with only the corrected JSON."
                )
                text = _send(provider, req, usage)
                data, err = parse_json(text, schema)
            if err:
                raise AIError(
                    "unknown",
                    provider,
                    detail=err,
                    message=f"{provider_name(provider)} returned an answer we couldn't read. "
                    "Try again or switch provider in Settings.",
                )
    except Exception as e:
        kind = e.kind if isinstance(e, AIError) else "unknown"
        if kind == "invalid_key" and resolved["source"] == "user":
            user_keys.mark_invalid(user_id, provider)
        log(False, kind)
        raise
    log(True)
    return {
        "data": data,
        "provider": provider,
        "model": tier["model"],
        "usage": usage,
        "latency_ms": round((time.monotonic() - started) * 1000),
    }


def _send(provider: str, req: CallRequest, usage: dict) -> str:
    attempt = 0
    while True:
        url, headers, body = build_request(provider, req)
        try:
            status, res_headers, raw = _http(url, headers, body)
        except (urllib.error.URLError, TimeoutError) as e:
            raise AIError("unknown", provider, detail=repr(e)) from e
        try:
            parsed: Any = json.loads(raw)
        except ValueError:
            parsed = raw  # non-JSON error page
        r = interpret(provider, status, res_headers, parsed)
        if r["ok"]:
            usage["input_tokens"] += r["input_tokens"]
            usage["output_tokens"] += r["output_tokens"]
            return r["text"]
        retry = (
            r["kind"] in ("rate_limited", "overloaded")
            and attempt < MAX_RETRIES
            and (r["retry_after"] or 0) <= MAX_WAIT_S
        )
        if not retry:
            raise AIError(r["kind"], provider, r["retry_after"], detail=raw[:2000])
        _sleep(r["retry_after"] or 2**attempt)
        attempt += 1


def parse_json(text: str, schema: type[BaseModel]) -> tuple[Any, str | None]:
    """Tolerates code fences / leading prose, then validates. (model, None) or (None, error)."""
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    s = (m.group(1) if m else text).strip()
    starts = [i for i in (s.find("{"), s.find("[")) if i >= 0]
    start, end = (min(starts) if starts else -1), max(s.rfind("}"), s.rfind("]"))
    try:
        value = json.loads(s[start : end + 1] if 0 <= start < end else s)
    except ValueError as e:
        return None, f"not JSON ({e})"
    try:
        return schema.model_validate(value), None
    except ValidationError as e:
        return None, str(e)


def _log_call(user_id, provider, source, model, task, usage, started, ok, error_kind) -> None:
    try:
        with db.connect() as c:
            c.execute(
                "insert into llm_calls (user_id, provider, key_source, model, task, input_tokens,"
                " output_tokens, latency_ms, ok, error_kind)"
                " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    user_id,
                    provider,
                    source,
                    model,
                    task,
                    usage["input_tokens"],
                    usage["output_tokens"],
                    round((time.monotonic() - started) * 1000),
                    ok,
                    error_kind,
                ),
            )
    except Exception as e:  # never fail the call over the log
        print(f"llm_calls insert failed: {e!r}")
