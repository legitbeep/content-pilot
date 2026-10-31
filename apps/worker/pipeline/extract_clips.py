# Docs: docs/pipeline.md
"""Pick candidates with reasons; cut each to clips/<clip_id>/source.mp4 with 5s handles;
store clip rows (+ word slice) and initial timelines relative to the clip file."""


def run(job: dict) -> None:
    raise NotImplementedError
