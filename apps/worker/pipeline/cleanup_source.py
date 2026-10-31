# Docs: docs/pipeline.md
"""Not a pipeline step: run by the cleanup sweep after "Proceed with editing" or 48h.
Deletes the source video and every unselected candidate clip file; sets source_deleted_at."""


def run(job: dict) -> None:
    raise NotImplementedError
