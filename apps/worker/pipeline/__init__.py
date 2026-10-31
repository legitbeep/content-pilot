# Docs: docs/pipeline.md
"""Ordered pipeline. Each step is idempotent: run(job) -> None, safe to re-run after a crash."""

from collections.abc import Callable

from . import probe, transcribe
from .errors import NeedsInput, StepError, Stopped

__all__ = ["STEPS", "NeedsInput", "StepError", "Stopped", "run", "step_name"]

# Built so far. nsfw_check, brand_fit and extract_clips are stubs and join STEPS when built;
# until then a job is `done` after transcription (note: "Clip extraction not built yet").
# cleanup_source is NOT a step: it runs later from the cleanup sweep (docs/pipeline.md).
STEPS = [probe, transcribe]


def step_name(step) -> str:
    return step.__name__.rsplit(".", 1)[-1]


def run(
    job: dict,
    should_stop: Callable[[], bool],
    on_step: Callable[[str, int, int], None] = lambda name, i, n: None,
) -> None:
    """Runs from job["resume_from_step"] (or the first step). on_step(name, index, total) is
    called before each step so the caller can record current_step/progress."""
    names = [step_name(s) for s in STEPS]
    resume = job.get("resume_from_step")
    start = names.index(resume) if resume in names else 0
    for i, step in enumerate(STEPS[start:], start):
        if should_stop():
            raise Stopped(step_name(step))
        on_step(step_name(step), i, len(STEPS))
        step.run(job)
