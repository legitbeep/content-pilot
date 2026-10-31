import json
from pathlib import Path

import pytest

import main
from worker import transcription
from worker.llm import keys
from worker.llm.errors import MISSING_KEY_MESSAGE, AIError
from worker.transcript import Transcript, Word
from worker.transcription import groq

FX = json.loads((Path(__file__).parent / "fixtures" / "groq_chunks.json").read_text())


def test_chunk_plan_overlaps_and_covers():
    assert groq.chunk_plan(300) == [(0.0, 300)]
    plan = groq.chunk_plan(1500)
    assert plan == [(0.0, 600.0), (598.0, 600.0), (1196.0, 304.0)]
    small = groq.chunk_plan(100, max_bytes=100_000)  # 22.5s chunks
    assert all(
        b[0] - a[0] == pytest.approx(22.5 - 2) for a, b in zip(small, small[1:], strict=False)
    )
    assert small[-1][0] + small[-1][1] == pytest.approx(100)


def test_stitch_offsets_and_dedupes_overlap():
    words, utterances = groq.stitch([(c["start"], c["response"]) for c in FX["chunks"]])
    got = [(w.w, round(w.start, 2), round(w.end, 2)) for w in words]
    assert got == [tuple(w) for w in FX["expected_words"]]
    assert all(w.speaker is None for w in words)
    assert [u.text for u in utterances] == ["Hello", "big world again", "bye"]


# --- job outcome when the user has no key, then retry after adding one -----------------------


@pytest.fixture
def world(monkeypatch):
    """Fake DB/R2: job rows written via update_job, a mutable set of the user's keys."""
    state = {"keys": [], "writes": []}
    monkeypatch.setattr(main.db, "update_job", lambda job_id, **f: state["writes"].append(f))
    monkeypatch.setattr(main, "stop_requested", lambda job: False)
    monkeypatch.setattr("pipeline.probe.run", lambda job: None)
    for later in ("nsfw_check", "brand_fit", "extract_clips"):  # tested in their own files
        monkeypatch.setattr(f"pipeline.{later}.run", lambda job: None)
    monkeypatch.setattr("pipeline.transcribe.r2.presigned_get", lambda key: "https://r2/src")
    monkeypatch.setattr("pipeline.transcribe.r2.put_json", lambda key, data: None)
    monkeypatch.setattr("pipeline.transcribe.r2.exists", lambda key: False)
    monkeypatch.setattr(
        transcription, "load_user_ai", lambda uid: keys.UserAI(usable=state["keys"])
    )
    monkeypatch.setattr(transcription, "key_for", lambda uid, r: "own-deepgram")
    monkeypatch.setattr(transcription.user_keys, "mark_valid", lambda uid, p: None)
    fake = Transcript(provider="deepgram", duration_s=1, words=[Word(w="hi", start=0, end=1)],
                      utterances=[])  # fmt: skip
    monkeypatch.setattr(transcription.deepgram, "transcribe", lambda key, url: fake)
    return state


def test_missing_key_fails_job_then_retry_works(world):
    job = {"id": "j1", "user_id": "u1", "source_key": "s", "steps": [], "resume_from_step": None}
    assert main.process(dict(job)) == "failed"
    final = world["writes"][-1]
    assert final["error"] == MISSING_KEY_MESSAGE  # readable, not the generic crash message
    assert final["steps"].obj[-1] == final["steps"].obj[-1] | {
        "step": "transcribe",
        "status": "failed",
    }  # noqa: E501
    assert "Traceback" not in (final.get("error_detail") or "")

    world["keys"].append("deepgram")  # user adds a key, presses Retry (resumes at transcribe)
    retry = {**job, "resume_from_step": "transcribe", "steps": final["steps"].obj}
    assert main.process(retry) == "done"
    assert any(w.get("transcript_path") == "transcripts/j1.json" for w in world["writes"])


def test_rejected_key_marks_invalid(monkeypatch):
    monkeypatch.setattr(transcription, "load_user_ai", lambda uid: keys.UserAI(usable=["groq"]))
    monkeypatch.setattr(transcription, "key_for", lambda uid, r: "k")
    marked = []
    monkeypatch.setattr(transcription.user_keys, "mark_invalid", lambda u, p: marked.append(p))

    def reject(key, url):
        raise AIError("invalid_key", "groq")

    monkeypatch.setattr(transcription.groq, "transcribe", reject)
    with pytest.raises(AIError, match="Your Groq key was rejected"):
        transcription.transcribe("u1", "https://r2/src")
    assert marked == ["groq"]


def test_groq_request_sends_user_agent(monkeypatch, tmp_path):
    seen = {}

    def fake_urlopen(req, timeout):
        seen["ua"] = req.get_header("User-agent")
        raise groq.urllib.error.URLError("stop")

    monkeypatch.setattr(groq.urllib.request, "urlopen", fake_urlopen)
    audio = tmp_path / "a.mp3"
    audio.write_bytes(b"x")
    with pytest.raises(AIError):
        groq._post("k", audio)
    assert seen["ua"] == "clip-studio-worker/1.0"


def test_cloudflare_403_is_not_a_bad_key():
    from worker.transcription.errors import http_error

    e = http_error("groq", 403, "error code: 1010")
    assert e.kind != "invalid_key" and "rejected" not in e.message
    assert http_error("groq", 403, '{"error":"forbidden"}').kind == "invalid_key"
