# Docs: docs/pipeline.md
"""Ordered pipeline. Each step is idempotent: run(job) -> None, safe to re-run after a crash."""

from collections.abc import Callable

from . import brand_fit, cleanup_source, extract_clips, nsfw_check, transcribe

STEPS = [transcribe, nsfw_check, brand_fit, extract_clips, cleanup_source]


def step_name(step) -> str:
    return step.__name__.rsplit(".", 1)[-1]


class Stopped(Exception):
    """User requested stop; raised before `step` would run."""

    def __init__(self, step: str):
        super().__init__(step)
        self.step = step


class NeedsInput(Exception):
    """Raised by a step to pause the job. Caller sets status='needs_input',
    input_request=request, resume_from_step=resume_from, and releases the slot."""

    def __init__(self, request: dict, resume_from: str):
        super().__init__(resume_from)
        self.request = request
        self.resume_from = resume_from


def run(job: dict, should_stop: Callable[[], bool]) -> None:
    names = [step_name(s) for s in STEPS]
    start = names.index(job["resume_from_step"]) if job.get("resume_from_step") else 0
    for step in STEPS[start:]:
        if should_stop():
            raise Stopped(step_name(step))
        step.run(job)
