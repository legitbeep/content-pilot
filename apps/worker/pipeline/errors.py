# Docs: docs/pipeline.md
"""Exceptions steps raise to stop, pause or fail a job (handled in main.py)."""


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


class StepError(Exception):
    """A failure the user can act on. `message` is shown in the UI as-is (jobs.error);
    `detail` is technical (jobs.error_detail)."""

    def __init__(self, message: str, detail: str = ""):
        super().__init__(message)
        self.message = message
        self.detail = detail
