# Docs: docs/llm.md
"""Manual check only (spends a few tokens): one short JSON call per saved LLM key, both tiers.
    pnpm llm:smoke <user_id>   # the user's own keys (or the demo key if allowlisted and keyless)
Prints provider, model, status, tokens and latency per call; never prints keys."""

import sys
import time

from pydantic import BaseModel

from . import _send, parse_json
from .errors import AIError
from .keys import key_for, load_user_ai
from .providers import CallRequest
from .registry import LLM_PROVIDERS, model_for


class Ok(BaseModel):
    ok: bool


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: pnpm llm:smoke <user_id>", file=sys.stderr)
        return 2
    user_id = argv[0]
    ai = load_user_ai(user_id)
    targets = [{"provider": p, "source": "user"} for p in LLM_PROVIDERS if p in ai.usable]
    if not targets and ai.demo:
        targets = [{"provider": "gemini", "source": "demo"}]
    if not targets:
        print("No LLM keys to test.")
        return 1
    failed = 0
    for r in targets:
        p = r["provider"]
        for task in ("captions", "extract_clips"):  # fast + smart tier
            tier = model_for(p, task)
            schema = Ok.model_json_schema()
            system = f'Reply with only this JSON: {{"ok": true}}. JSON Schema: {schema}'
            req = CallRequest(key=key_for(user_id, r), tier=tier, system=system, prompt="Go.")
            req.schema = schema
            usage = {"input_tokens": 0, "output_tokens": 0}
            started = time.monotonic()
            try:
                _, err = parse_json(_send(p, req, usage), Ok)
                status = f"bad JSON: {err}" if err else "ok"
            except AIError as e:
                status = f"{e.kind}: {e.message} ({e.detail[:200]})"
            failed += status != "ok"
            ms = round((time.monotonic() - started) * 1000)
            print(f"{p} ({r['source']}) {tier['model']}: {status} · {usage} · {ms}ms")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
