import pytest

import pipeline
from pipeline import Stopped, run


@pytest.fixture
def calls(monkeypatch):
    seen = []
    for step in pipeline.STEPS:
        name = pipeline.step_name(step)
        monkeypatch.setattr(step, "run", lambda job, n=name: seen.append(n))
    return seen


def test_runs_all_steps_in_order(calls):
    run({}, should_stop=lambda: False)
    assert calls == ["probe", "transcribe"]


def test_resumes_from_step(calls):
    run({"resume_from_step": "transcribe"}, should_stop=lambda: False)
    assert calls == ["transcribe"]


def test_unknown_resume_step_starts_over(calls):
    run({"resume_from_step": "extract_clips"}, should_stop=lambda: False)
    assert calls == ["probe", "transcribe"]


def test_stop_checked_between_steps(calls):
    with pytest.raises(Stopped) as e:
        run({}, should_stop=lambda: len(calls) == 1)
    assert e.value.step == "transcribe"


def test_on_step_reports_progress(calls):
    seen = []
    run({}, should_stop=lambda: False, on_step=lambda n, i, total: seen.append((n, i, total)))
    assert seen == [("probe", 0, 2), ("transcribe", 1, 2)]
