# Docs: docs/timeline.md
"""Render loop: claim clips with render_status = 'queued' (SKIP LOCKED), render the timeline with
FFmpeg, upload renders/{clip_id}.mp4. `python -m worker.run_once render <clip_id>` runs one."""

import logging
import tempfile
import time
import traceback
from pathlib import Path
from typing import Literal

from pydantic import ValidationError

from pipeline import nsfw_check
from pipeline.errors import StepError
from worker import db, r2
from worker.llm.errors import AIError
from worker.render import RenderError, render
from worker.timeline import Timeline

POLL_SECONDS = 5
log = logging.getLogger("worker.render")

CLAIM_SQL = """
update clips set render_status = 'rendering', render_error = null
where id = (select c.id from clips c
            where c.render_status = 'queued' and (%(id)s::uuid is null or c.id = %(id)s::uuid)
            order by c.render_requested_at nulls first
            for update skip locked limit 1)
returning id, user_id
"""

# Only flip states the render still owns: a Save during rendering re-queues and must win.
FINISH_SQL = """
update clips set render_status = case when render_status = 'rendering' then %(status)s
                                      else render_status end,
       render_path = coalesce(%(path)s, render_path), render_error = %(error)s,
       rendered_at = case when %(path)s::text is null then rendered_at else now() end
where id = %(id)s and user_id = %(user_id)s
"""


def claim(clip_id: str | None = None) -> dict | None:
    with db.connect() as c:
        return c.execute(CLAIM_SQL, {"id": clip_id}).fetchone()


def _finish(clip: dict, status: str, path: str | None = None, error: str | None = None) -> None:
    with db.connect() as c:
        c.execute(FINISH_SQL, {**clip, "status": status, "path": path, "error": error})


def _inputs(user_id: str, t: Timeline) -> dict[str, list[dict]]:
    """Words of each clip file the timeline uses; refuses keys the user doesn't own."""
    keys = {t.segment_key(s) for s in t.segments} | {a.key for a in t.audio}
    with db.connect() as c:
        rows = c.execute(
            "select file_key, words from clips where user_id = %s and file_key = any(%s)",
            (user_id, list(keys)),
        ).fetchall()
    words = {r["file_key"]: r["words"] or [] for r in rows}
    foreign = [k for k in keys if k not in words and not k.startswith(f"uploads/{user_id}/")]
    if foreign:
        raise RenderError("This clip uses a file that no longer exists. Remove it and try again.")
    return words


def _check_uploads(user_id: str, t: Timeline) -> None:
    """NSFW check of the user's own uploads in the timeline (docs/pipeline.md "nsfw_check")."""
    prefix = f"uploads/{user_id}/"
    kinds: list[tuple[str, Literal["audio", "video"]]] = [
        *((t.segment_key(s), "video") for s in t.segments),
        *((a.key, "audio") for a in t.audio),
    ]
    used = sorted(set(kinds))
    for key, kind in used:
        if not key.startswith(prefix):
            continue  # clip files were checked when the long video was ingested
        name = key.rsplit("/", 1)[-1]
        try:
            verdict = nsfw_check.check_upload(user_id, key, kind)
        except (StepError, AIError) as e:
            raise RenderError(f"Couldn't safety-check {name}: {e.message}") from e
        if verdict == "explicit":
            raise RenderError(
                f"{name} contains explicit content and can't be used. Remove it from this clip."
            )


def process(clip: dict) -> str:
    """Render one claimed clip; returns 'done' or 'failed: <message>'."""
    cid, uid = str(clip["id"]), str(clip["user_id"])
    clip = {"id": cid, "user_id": uid}
    try:
        with db.connect() as c:
            row = c.execute(
                "select data, revision from timelines where clip_id = %s and user_id = %s",
                (cid, uid),
            ).fetchone()
        if not row:
            raise RenderError("This clip has no edit yet. Open it in the editor first.")
        try:
            t = Timeline.model_validate(row["data"])
        except ValidationError as e:
            raise RenderError("This clip's edit is invalid. Make a change and save again.") from e
        words = _inputs(uid, t)
        _check_uploads(uid, t)
        key = f"renders/{cid}.mp4"
        with tempfile.TemporaryDirectory() as tmp:
            out = str(Path(tmp) / "render.mp4")
            log.info("render %s: start (revision %s)", cid, row["revision"])
            render(t, r2.presigned_get, words, out)
            r2.upload_file(out, key, "video/mp4")
        with db.connect() as c:
            c.execute(
                "update timelines set rendered_key = %s, rendered_revision = %s "
                "where clip_id = %s and user_id = %s",
                (key, row["revision"], cid, uid),
            )
        _finish(clip, "done", path=key)
        log.info("render %s: done", cid)
        return "done"
    except RenderError as e:
        log.warning("render %s: %s", cid, e)
        _finish(clip, "failed", error=str(e))
        return f"failed: {e}"
    except Exception:
        log.error("render %s crashed\n%s", cid, traceback.format_exc())
        _finish(clip, "failed", error="Render failed. Try again.")
        return "failed: crashed"


def run_once(clip_id: str) -> str:
    clip = claim(clip_id)
    return process(clip) if clip else "failed: not queued (press Save in the editor first)"


def loop() -> None:
    # ponytail: assumes one worker process; with several, requeue only stale claims (claimed_at).
    with db.connect() as c:
        c.execute("update clips set render_status = 'queued' where render_status = 'rendering'")
    while True:
        try:
            clip = claim()
        except Exception:
            log.exception("render claim failed")
            clip = None
        if clip:
            process(clip)
        else:
            time.sleep(POLL_SECONDS)
