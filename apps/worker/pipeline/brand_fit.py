# Docs: docs/pipeline.md
"""Soft check against brand memory. On mismatch: raise NeedsInput(question, "extract_clips").
The user's answer flips the job back to pending and the pipeline resumes at extract_clips."""


def run(job: dict) -> None:
    raise NotImplementedError
