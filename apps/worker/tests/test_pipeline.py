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
    assert calls == ["transcribe", "nsfw_check", "brand_fit", "extract_clips"]


def test_resumes_from_step(calls):
    run({"resume_from_step": "extract_clips"}, should_stop=lambda: False)
    assert calls == ["extract_clips"]


def test_stop_checked_between_steps(calls):
    with pytest.raises(Stopped) as e:
        run({}, should_stop=lambda: len(calls) == 2)
    assert e.value.step == "brand_fit"
