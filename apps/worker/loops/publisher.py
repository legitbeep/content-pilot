# Docs: docs/publishing.md
"""Publisher loop: every 60s claim due YouTube posts (SKIP LOCKED) and upload them."""

import json
import logging
import subprocess
import tempfile
import time
from datetime import UTC, datetime, timedelta

from pipeline.probe import parse
from worker import db, r2, youtube
from worker.crypto import decrypt

log = logging.getLogger("publisher")

POLL_SECONDS = 60
MAX_ATTEMPTS = 3
SHORTS_MAX_SECONDS = 180  # vertical/square and <= 3 min is a Short (YouTube, since 2024-10-15)
RECONNECT = "YouTube access expired. Reconnect in Settings."

# id given (run_once): claim that post even if it isn't due yet.
CLAIM_SQL = """
update posts set status = 'publishing', attempts = attempts + 1, updated_at = now()
where id = (select id from posts
            where status = 'scheduled' and platform = 'youtube'
              and (case when %(id)s::uuid is null then scheduled_at <= now()
                        else id = %(id)s::uuid end)
            order by scheduled_at
            for update skip locked limit 1)
returning *
"""


def claim(post_id: str | None = None) -> dict | None:
    with db.connect() as c:
        return c.execute(CLAIM_SQL, {"id": post_id}).fetchone()


def update_post(post: dict, **fields) -> None:
    cols = ", ".join(f"{k} = %({k})s" for k in fields)
    with db.connect() as c:
        c.execute(
            f"update posts set {cols}, updated_at = now() "  # type: ignore[arg-type]
            "where id = %(id)s and user_id = %(user_id)s",
            {**fields, "id": post["id"], "user_id": post["user_id"]},
        )


def probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    )
    return parse(json.loads(out.stdout))


def is_short(media: dict) -> bool:
    return media["height"] >= media["width"] > 0 and media["duration_s"] <= SHORTS_MAX_SECONDS


def with_shorts_tag(description: str) -> str:
    return description if "#shorts" in description.lower() else f"{description}\n\n#Shorts".strip()


def backoff(attempts: int) -> timedelta:
    return timedelta(minutes=2 ** (attempts - 1))  # 1, 2, 4 min


def _load(post: dict) -> tuple[dict | None, dict | None]:
    with db.connect() as c:
        clip = c.execute(
            "select render_path from clips where id = %s and user_id = %s",
            (post["clip_id"], post["user_id"]),
        ).fetchone()
        conn = c.execute(
            "select refresh_token_ciphertext, iv from platform_connections "
            "where user_id = %s and platform = 'youtube'",
            (post["user_id"],),
        ).fetchone()
    return clip, conn


def publish(post: dict) -> str:
    """Upload one claimed post; record the outcome and return the final status."""

    def fail(error: str) -> str:
        update_post(post, status="failed", error=error)
        return "failed"

    try:
        clip, conn = _load(post)
        if not clip or not clip["render_path"]:
            return fail("This clip has no rendered video. Render it in the editor, then retry.")
        if not conn:
            return fail("YouTube isn't connected. Connect it in Settings, then retry.")
        token = youtube.access_token(decrypt(conn["refresh_token_ciphertext"], conn["iv"]))
        with tempfile.TemporaryDirectory() as tmp:
            path = f"{tmp}/clip.mp4"
            r2.download_file(clip["render_path"], path)
            short = is_short(probe(path))
            description = post["caption"] or ""
            if short:
                description = with_shorts_tag(description)
            video_id = youtube.upload(
                token, path, post["title"] or "Untitled clip", description, post["tags"] or []
            )
    except youtube.ReconnectNeeded as e:
        log.warning("post %s: reconnect needed: %s", post["id"], e)
        return fail(RECONNECT)
    except Exception as e:
        retry = getattr(e, "retry", True)
        message = getattr(e, "message", "Upload to YouTube failed.")
        log.warning("post %s: attempt %s failed: %r %s", post["id"], post["attempts"], e,
                    getattr(e, "detail", ""))  # fmt: skip
        if retry and post["attempts"] < MAX_ATTEMPTS:
            update_post(
                post,
                status="scheduled",
                scheduled_at=datetime.now(UTC) + backoff(post["attempts"]),
                error=f"{message} Retrying (attempt {post['attempts']} of {MAX_ATTEMPTS}).",
            )
            return "scheduled"
        return fail(f"{message} Retry from the calendar." if retry else message)

    url = (
        f"https://youtube.com/shorts/{video_id}"
        if short
        else f"https://www.youtube.com/watch?v={video_id}"
    )
    update_post(
        post,
        status="posted",
        posted_at=datetime.now(UTC),
        external_id=video_id,
        external_url=url,
        error=None,
    )
    log.info("post %s: posted %s", post["id"], url)
    return "posted"


def run_once(post_id: str) -> str:
    post = claim(post_id)
    if not post:
        return "failed: not claimable (not a scheduled youtube post, or missing)"
    return publish(post)


def tick() -> None:
    while post := claim():
        publish(post)


def loop() -> None:
    while True:
        try:
            tick()
        except Exception:
            log.exception("publisher tick failed")
        time.sleep(POLL_SECONDS)
