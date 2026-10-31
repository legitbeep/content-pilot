import pytest

import main
from pipeline import StepError, Stopped


@pytest.fixture
def writes(monkeypatch):
    out: list[dict] = []
    monkeypatch.setattr(main.db, "update_job", lambda job_id, **f: out.append(f))
    monkeypatch.setattr(main, "stop_requested", lambda job: False)
    return out


def job():
    return {"id": "j1", "user_id": "u1", "steps": [], "resume_from_step": None}


def fake_run(exc=None):
    def run(job, should_stop, on_step):
        on_step("probe", 0, 2)
        on_step("transcribe", 1, 2)
        if exc:
            raise exc

    return run


def test_done_records_progress(monkeypatch, writes):
    monkeypatch.setattr(main, "run", fake_run())
    main.process(job())
    final = writes[-1]
    assert final["status"] == "done" and final["progress"] == 100
    assert [s["status"] for s in final["steps"].obj] == ["done", "done"]
    assert writes[1]["current_step"] == "transcribe" and writes[1]["progress"] == 50


def test_step_error_is_user_readable(monkeypatch, writes):
    err = StepError("Deepgram rejected the API key. Update it in Settings.", "HTTP 401")
    monkeypatch.setattr(main, "run", fake_run(err))
    main.process(job())
    final = writes[-1]
    assert final["status"] == "failed"
    assert final["error"].startswith("Deepgram rejected")
    assert final["error_detail"] == "HTTP 401"
    assert final["steps"].obj[-1]["status"] == "failed"


def test_crash_keeps_traceback_separate(monkeypatch, writes):
    monkeypatch.setattr(main, "run", fake_run(ValueError("boom")))
    main.process(job())
    final = writes[-1]
    assert final["status"] == "failed" and "transcribe" in final["error"]
    assert "ValueError: boom" in final["error_detail"]


def test_stop(monkeypatch, writes):
    monkeypatch.setattr(main, "run", fake_run(Stopped("transcribe")))
    main.process(job())
    assert writes[-1]["status"] == "stopped" and writes[-1]["current_step"] == "transcribe"
