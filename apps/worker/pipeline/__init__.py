# Docs: docs/pipeline.md
"""Ordered pipeline. Each step is idempotent: run(job) -> None, safe to re-run after a crash."""

from collections.abc import Callable

from worker.llm.errors import AIError

from . import brand_fit, nsfw_check, probe, transcribe
from .errors import NeedsInput, StepError, Stopped

__all__ = ["STEPS", "NeedsInput", "StepError", "Stopped", "run", "step_name"]

# extract_clips joins STEPS when built. cleanup_source is NOT a step: it runs later from the
# cleanup sweep (docs/pipeline.md).
STEPS = [probe, transcribe, nsfw_check, brand_fit]


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
        try:
            step.run(job)
        except AIError as e:  # any AI adapter error (incl. missing_key) is user-readable
            raise StepError(e.message, e.detail) from e
