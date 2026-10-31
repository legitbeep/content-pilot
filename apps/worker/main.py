# Docs: docs/queue.md
"""Worker entrypoint: claim jobs from Postgres and run the pipeline (docs/queue.md)."""

import logging
import os
import threading
import time
import traceback
from datetime import UTC, datetime

from loops import cleanup, publisher
from loops import render as render_loop
from pipeline import NeedsInput, StepError, Stopped, run
from worker import db

POLL_SECONDS = 5
MAX_PROCESSING_PER_USER = 2

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(threadName)s %(message)s")
log = logging.getLogger("worker")

CLAIM_SQL = """
update jobs set status = 'processing', claimed_at = now(), attempts = attempts + 1,
       stop_requested = false, error = null, error_detail = null, note = null, updated_at = now()
where id = (select j.id from jobs j
            where j.status = 'pending'
              and (%(id)s::uuid is null or j.id = %(id)s::uuid)
              and (select count(*) from jobs p
                   where p.user_id = j.user_id and p.status = 'processing') < %(limit)s
            order by j.position, j.created_at
            for update skip locked limit 1)
returning *
"""


def claim_job(job_id: str | None = None) -> dict | None:
    """Claim the next pending job, or only `job_id` when given (run-once mode)."""
    with db.connect() as c:
        return c.execute(CLAIM_SQL, {"limit": MAX_PROCESSING_PER_USER, "id": job_id}).fetchone()


def stop_requested(job: dict) -> bool:
    with db.connect() as c:
        row = c.execute(
            "select stop_requested from jobs where id = %s and user_id = %s",
            (job["id"], job["user_id"]),
        ).fetchone()
    return bool(row and row["stop_requested"])


def now() -> str:
    return datetime.now(UTC).isoformat()


def process(job: dict) -> str:
    """Run one claimed job, record the outcome and return the final status."""
    steps: list[dict] = list(job.get("steps") or [])

    def finish_step(status: str) -> None:
        if steps and steps[-1]["status"] == "running":
            steps[-1] |= {"status": status, "finished_at": now()}

    def on_step(name: str, i: int, n: int) -> None:
        finish_step("done")
        steps.append({"step": name, "status": "running", "started_at": now()})
        job["current_step"] = name
        db.update_job(
            job["id"], current_step=name, progress=round(100 * i / n), steps=db.Jsonb(steps)
        )

    def finish(status: str, step_status: str, **fields) -> str:
        finish_step(step_status)
        db.update_job(job["id"], status=status, steps=db.Jsonb(steps), **fields)
        return status

    log.info("job %s: start (resume_from=%s)", job["id"], job.get("resume_from_step"))
    try:
        run(job, should_stop=lambda: stop_requested(job), on_step=on_step)
    except Stopped as e:
        log.info("job %s: stopped before %s", job["id"], e.step)
        return finish("stopped", "stopped", current_step=e.step, stop_requested=False)
    except NeedsInput as e:
        return finish(
            "needs_input",
            "done",
            input_request=db.Jsonb(e.request),
            resume_from_step=e.resume_from,
        )
    except StepError as e:
        log.warning("job %s: %s failed: %s %s", job["id"], job["current_step"], e.message, e.detail)
        return finish("failed", "failed", error=e.message, error_detail=e.detail or None)
    except Exception:
        detail = traceback.format_exc()
        log.error("job %s: %s crashed\n%s", job["id"], job.get("current_step"), detail)
        step = (job.get("current_step") or "processing").replace("_", " ")
        return finish(
            "failed",
            "failed",
            error=f"Something went wrong while running {step}. Retry, or check the details.",
            error_detail=detail[-4000:],
        )
    else:
        log.info("job %s: done", job["id"])
        return finish(
            "done",
            "done",
            progress=100,
            finished_at=datetime.now(UTC),
            resume_from_step=None,
        )


def loop() -> None:
    while True:
        try:
            job = claim_job()
        except Exception:
            log.exception("claim failed")
            job = None
        if job:
            try:
                process(job)
            except Exception:  # e.g. DB down while recording the outcome; job stays processing
                log.exception("job %s: could not record outcome", job["id"])
        else:
            time.sleep(POLL_SECONDS)


def main() -> None:
    n = int(os.environ.get("WORKER_CONCURRENCY", "1"))
    log.info("worker up: concurrency=%d", n)
    threads = [threading.Thread(target=loop, name=f"w{i}", daemon=True) for i in range(n)]
    threads.append(threading.Thread(target=render_loop.loop, name="render", daemon=True))
    threads.append(threading.Thread(target=publisher.loop, name="publisher", daemon=True))
    threads.append(threading.Thread(target=cleanup.loop, name="cleanup", daemon=True))
    for t in threads:
        t.start()
    for t in threads:
        t.join()


if __name__ == "__main__":
    main()
