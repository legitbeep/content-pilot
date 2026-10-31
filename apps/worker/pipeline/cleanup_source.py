# Docs: docs/pipeline.md
"""Not a pipeline step: run by the cleanup loop (loops/cleanup.py) after "Proceed with editing"
or 48h after the job finished. Deletes the source video and every unselected clip's files (rows
stay, file_key/thumb_key set to null, as a negative signal); sets source_deleted_at.
Idempotent: missing objects count as deleted."""

from worker import db, r2


def run(job: dict) -> None:
    with db.connect() as c:
        rows = c.execute(
            "select id, file_key, thumb_key from clips where job_id = %s and user_id = %s "
            "and not selected and (file_key is not null or thumb_key is not null)",
            (job["id"], job["user_id"]),
        ).fetchall()
    for r in rows:
        for key in (r["file_key"], r["thumb_key"]):
            if key:
                r2.delete(key)
    r2.delete(job["source_key"])
    with db.connect() as c:
        if rows:
            c.execute(
                "update clips set file_key = null, thumb_key = null "
                "where id = any(%s) and user_id = %s",
                ([r["id"] for r in rows], job["user_id"]),
            )
        c.execute(
            "update jobs set source_deleted_at = now(), updated_at = now() "
            "where id = %s and user_id = %s",
            (job["id"], job["user_id"]),
        )
