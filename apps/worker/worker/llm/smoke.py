# Docs: docs/llm.md
"""Manual check only (spends a few tokens). For each LLM key the user has (or the demo key when
allowlisted and keyless), on both tiers: one generate_text call and one generate_json call (small
schema, exercises the provider's JSON mode + validation). Reports ok/fail per provider + mode.
    pnpm llm:smoke <user_id>
Calls are logged to llm_calls like any other; keys are never printed."""

import sys

from pydantic import BaseModel

from . import _run
from .errors import AIError
from .keys import load_user_ai
from .registry import LLM_PROVIDERS, model_for


class Ok(BaseModel):
    ok: bool
    word: str


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
        for task in ("captions", "extract_clips"):  # fast + smart tier
            model = model_for(r["provider"], task)["model"]
            for mode, schema, prompt in (
                ("text", None, "Reply with the single word: ok"),
                ("json", Ok, 'Return ok = true and word = "hello".'),
            ):
                try:
                    res = _run(user_id, task, "You are a test.", prompt, schema, resolved=r)
                    status = f"ok · {res['usage']} · {res['latency_ms']}ms"
                except AIError as e:
                    failed += 1
                    status = f"FAIL {e.kind}: {e.message} ({e.detail[:200]})"
                print(f"{r['provider']} ({r['source']}) {model} {mode}: {status}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
