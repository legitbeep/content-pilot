import json
from pathlib import Path

import pytest
from pydantic import BaseModel

from worker import llm
from worker.llm import errors, keys
from worker.llm.providers import interpret
from worker.llm.registry import provider_name

ROOT = Path(__file__).parents[3]
RESPONSES = json.loads((ROOT / "packages/llm-registry/fixtures/responses.json").read_text())
RESOLUTION = json.loads((ROOT / "fixtures/key-resolution.json").read_text())
SERVER_ENV = {
    # Server keys present on purpose: only allowlisted users may use them.
    "GEMINI_API_KEY": "server-gemini",
    "GROQ_API_KEY": "server-groq",
    "ANTHROPIC_API_KEY": "server-anthropic",
    "DEEPGRAM_API_KEY": "server-deepgram",
    "CLAUDE_OAUTH_TOKEN": "server-oauth",
    "DEMO_ALLOWED_EMAILS": "demo@example.com, other@example.com",
}


def test_worker_registry_matches_package():
    src = json.loads((ROOT / "packages/llm-registry/registry.json").read_text())
    copy = json.loads((ROOT / "apps/worker/worker/llm/registry.json").read_text())
    assert copy == src, "run `pnpm gen:llm-registry`"


@pytest.mark.parametrize("c", RESPONSES["cases"], ids=[c["name"] for c in RESPONSES["cases"]])
def test_provider_fixture(c):
    r = interpret(c["provider"], c["status"], c["headers"], c["body"])
    e = c["expect"]
    if "text" in e:
        assert r == {"ok": True, **e}
    else:
        assert r == {"ok": False, "kind": e["kind"], "retry_after": e["retry_after"]}
        name = provider_name(c["provider"])
        assert errors.message_for(e["kind"], name, e["retry_after"]) == e["message"]


def test_missing_key_message():
    assert errors.AIError("missing_key").message == RESPONSES["missing_key_message"]


@pytest.mark.parametrize("c", RESOLUTION["cases"], ids=[c["name"] for c in RESOLUTION["cases"]])
def test_key_resolution_fixture(c):
    usable = [k["provider"] for k in c["keys"] if not k.get("invalid")]
    ai = keys.UserAI(usable=usable, settings=c["settings"], demo=c["demo"])
    assert keys.resolve_llm(ai, c["task"]) == c["llm"]
    assert keys.resolve_transcription(ai) == c["transcription"]


class Fake:
    """Stands in for the DB (keys, auth.users email, llm_calls) and the HTTP layer."""

    def __init__(self, monkeypatch, own: dict[str, str], email: str, confirmed: object = True):
        self.own, self.email, self.confirmed = own, email, confirmed
        self.calls: list[tuple] = []
        self.logs: list[tuple] = []
        self.responses: list[tuple[int, dict, dict]] = []
        for k, v in SERVER_ENV.items():
            monkeypatch.setenv(k, v)
        monkeypatch.setattr(keys, "load_user_ai", self.load_user_ai)
        monkeypatch.setattr(llm, "load_user_ai", self.load_user_ai)
        monkeypatch.setattr(keys.keys, "get_key", lambda uid, p: self.own[p])
        monkeypatch.setattr(llm, "_http", self.http)
        monkeypatch.setattr(llm, "_log_call", lambda *a: self.logs.append(a))
        monkeypatch.setattr(llm, "_sleep", lambda s: self.calls.append(("sleep", s)))
        monkeypatch.setattr(llm.user_keys, "mark_invalid", lambda u, p: self.calls.append(("x", p)))

    def load_user_ai(self, user_id):
        demo = keys.is_demo_user(self.email, self.confirmed)
        return keys.UserAI(usable=list(self.own), settings={}, demo=demo)

    def http(self, url, headers, body):
        self.calls.append((url, headers, body))
        status, hdrs, res = self.responses.pop(0)
        return status, hdrs, json.dumps(res)


def gen(**kw):
    return llm.generate_text(user_id="u1", task="captions", system="sys", prompt="hi", **kw)


def groq_ok(content):
    return (200, {}, {"choices": [{"message": {"content": content}, "finish_reason": "stop"}],
                      "usage": {"prompt_tokens": 3, "completion_tokens": 2}})  # fmt: skip


def test_non_allowlisted_user_gets_missing_key_even_with_server_env_keys(monkeypatch):
    f = Fake(monkeypatch, own={}, email="someone@example.com")
    with pytest.raises(errors.AIError) as e:
        gen()
    assert e.value.kind == "missing_key"
    assert e.value.message == "Add an AI provider key in Settings to use this."
    assert f.calls == []


def test_unverified_allowlisted_email_gets_missing_key(monkeypatch):
    Fake(monkeypatch, own={}, email="demo@example.com", confirmed=None)
    with pytest.raises(errors.AIError, match="Add an AI provider key"):
        gen()


def test_allowlisted_user_without_keys_uses_demo_gemini(monkeypatch):
    f = Fake(monkeypatch, own={}, email="Demo@Example.com")
    f.responses.append((200, {}, RESPONSES["cases"][7]["body"]))
    r = gen()
    url, headers, _ = f.calls[0]
    assert r["provider"] == "gemini" and "generativelanguage" in url
    assert headers["x-goog-api-key"] == "server-gemini"
    assert f.logs[0][2] == "demo" and f.logs[0][7] is True


def test_allowlisted_user_with_own_key_uses_own(monkeypatch):
    f = Fake(monkeypatch, own={"anthropic": "own-anthropic"}, email="demo@example.com")
    f.responses.append((200, {}, RESPONSES["cases"][0]["body"]))
    r = gen()
    assert r["provider"] == "anthropic" and r["data"] == '{"ok": true}'
    assert f.calls[0][1]["x-api-key"] == "own-anthropic"
    assert f.logs[0][2] == "user"


class Title(BaseModel):
    title: str


def test_json_repair_once(monkeypatch):
    f = Fake(monkeypatch, own={"groq": "own-groq"}, email="x@example.com")
    f.responses += [groq_ok('{"title": 5}'), groq_ok('```json\n{"title": "ok"}\n```')]
    r = llm.generate_json(user_id="u1", task="captions", schema=Title, system="s", prompt="p")
    assert r["data"] == Title(title="ok")
    assert r["usage"] == {"input_tokens": 6, "output_tokens": 4}
    assert "was not valid" in f.calls[1][2]["messages"][1]["content"]
    assert f.calls[1][2]["response_format"]["type"] == "json_schema"


def test_json_gives_up_after_one_repair(monkeypatch):
    f = Fake(monkeypatch, own={"groq": "own-groq"}, email="x@example.com")
    f.responses += [groq_ok("nope"), groq_ok("still nope")]
    with pytest.raises(errors.AIError, match="Groq returned an answer we couldn't read"):
        llm.generate_json(user_id="u1", task="captions", schema=Title, system="s", prompt="p")


def test_retries_then_succeeds(monkeypatch):
    f = Fake(monkeypatch, own={"groq": "own-groq"}, email="x@example.com")
    f.responses += [(429, {"retry-after": "3"}, {}), (503, {}, {}), groq_ok("hello")]
    assert gen()["data"] == "hello"
    assert [c for c in f.calls if c[0] == "sleep"] == [("sleep", 3), ("sleep", 2)]


def test_stops_after_two_retries(monkeypatch):
    f = Fake(monkeypatch, own={"groq": "own-groq"}, email="x@example.com")
    f.responses += [(503, {}, {})] * 3
    with pytest.raises(errors.AIError) as e:
        gen()
    assert e.value.kind == "overloaded"
    assert f.logs[0][7] is False and f.logs[0][8] == "overloaded"


def test_rejected_own_key_marked_invalid(monkeypatch):
    f = Fake(monkeypatch, own={"groq": "own-groq"}, email="x@example.com")
    f.responses.append((401, {}, {"error": {"message": "Invalid API Key"}}))
    with pytest.raises(errors.AIError, match="Groq key was rejected"):
        gen()
    assert ("x", "groq") in f.calls


def test_smoke_runs_text_and_json_per_provider(monkeypatch, capsys):
    from worker.llm import smoke

    f = Fake(monkeypatch, own={"groq": "own-groq"}, email="x@example.com")
    monkeypatch.setattr(smoke, "load_user_ai", f.load_user_ai)
    ok = '{"ok": true, "word": "hello"}'
    f.responses += [groq_ok("ok"), groq_ok(ok), groq_ok("ok"), groq_ok(ok)]
    assert smoke.main(["u1"]) == 0
    out = capsys.readouterr().out
    assert out.count("groq (user)") == 4 and " json: ok" in out and " text: ok" in out
    assert f.calls[1][2]["response_format"]["type"] == "json_schema"


def test_http_sends_user_agent(monkeypatch):
    seen = {}

    def fake_urlopen(req, timeout):
        seen["ua"] = req.get_header("User-agent")
        raise llm.urllib.error.URLError("stop")

    monkeypatch.setattr(llm.urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(llm.urllib.error.URLError):
        llm._http("https://x", {}, {})
    assert seen["ua"] == errors.USER_AGENT
