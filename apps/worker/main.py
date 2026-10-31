# Docs: docs/queue.md
"""Worker entrypoint: claim jobs from Postgres and run the pipeline. Stub loop for now."""

import logging
import time
from functools import partial

from pipeline import run

POLL_SECONDS = 5

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("worker")


def claim_job() -> dict | None:
    # TODO: SELECT ... FROM jobs WHERE status='pending' ORDER BY position, created_at
    #       FOR UPDATE SKIP LOCKED LIMIT 1, then set status='processing'. See docs/queue.md.
    return None


def stop_requested(job: dict) -> bool:
    # TODO: re-read jobs.stop_requested for this job.
    return False


def main() -> None:
    while True:
        log.info("claiming jobs...")
        job = claim_job()
        if job:
            # TODO: Stopped -> status='stopped'; NeedsInput -> status='needs_input' +
            # input_request + resume_from_step (releases the slot); other errors -> 'failed'.
            run(job, should_stop=partial(stop_requested, job))
        # TODO: cleanup sweep: done jobs with source_deleted_at null and
        # (proceeded_at set or finished_at < now() - 48h) -> pipeline.cleanup_source.run(job).
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
