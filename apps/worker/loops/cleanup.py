# Docs: docs/pipeline.md
"""Cleanup loop: done jobs whose source is still in R2 and that the user proceeded with (or that
finished 48h ago) → pipeline.cleanup_source.
`python -m worker.run_once cleanup <job_id>` runs one."""

import logging
import time

from pipeline import cleanup_source
from worker import db

POLL_SECONDS = 30
log = logging.getLogger("worker.cleanup")

DUE_SQL = """
select id, user_id, source_key from jobs
where status = 'done' and source_deleted_at is null
  and (proceeded_at is not null or finished_at < now() - interval '48 hours')
  and (%(id)s::uuid is null or id = %(id)s::uuid)
order by coalesce(proceeded_at, finished_at) limit 20
"""


def due(job_id: str | None = None) -> list[dict]:
    with db.connect() as c:
        return c.execute(DUE_SQL, {"id": job_id}).fetchall()


def run_once(job_id: str) -> str:
    jobs = due(job_id)
    if not jobs:
        return "failed: not due (not done, already cleaned, or not proceeded and < 48h old)"
    cleanup_source.run(jobs[0])
    return "cleaned"


def loop() -> None:
    # ponytail: two worker processes could clean the same job at once; deletes are idempotent.
    while True:
        try:
            for job in due():
                cleanup_source.run(job)
                log.info("job %s: source + unselected clip files deleted", job["id"])
        except Exception:
            log.exception("cleanup failed")
        time.sleep(POLL_SECONDS)
