# Docs: docs/publishing.md
"""Seed for plan 8: 3 rendered clips for the dev-login user. Idempotent.

  pnpm seed:publish         create (or recreate) the seed job, clips and renders
  pnpm seed:publish:clean   delete exactly what the seed created

Rows are tagged by the job title `seed:publish`; clips/posts cascade from that job.
"""

import os
import subprocess
import sys
import tempfile

from worker import db, r2

TAG = "seed:publish"
EMAIL = os.environ.get("SEED_EMAIL", "dev@clip-studio.test")
CLIPS = [
    ("Why most hooks fail in the first 2 seconds", "Open on the payoff, then explain."),
    ("The one editing trick that doubled my retention", "Cut every pause longer than 300ms."),
    ("Stop writing titles like this", "Specific numbers beat vague promises."),
]


def clean() -> None:
    with db.connect() as c:
        rows = c.execute(
            "select c.render_path from clips c join jobs j on j.id = c.job_id "
            "where j.title = %s and c.render_path is not null",
            (TAG,),
        ).fetchall()
        for r in rows:
            r2.delete(r["render_path"])
        n = c.execute("delete from jobs where title = %s", (TAG,)).rowcount
    print(f"cleaned {n} seed job(s), {len(rows)} render(s)")


def seed() -> None:
    clean()
    with db.connect() as c:
        user = c.execute("select id from auth.users where email = %s", (EMAIL,)).fetchone()
        if not user:
            sys.exit(f"No user {EMAIL}. Sign in once via /auth/dev-login, then rerun.")
        uid = user["id"]
        job = c.execute(
            "insert into jobs (user_id, status, source_key, title) "
            "values (%s, 'done', 'seed/publish', %s) returning id",
            (uid, TAG),
        ).fetchone()
        assert job
        with tempfile.TemporaryDirectory() as tmp:
            for i, (hook, rest) in enumerate(CLIPS):
                clip = c.execute(
                    "insert into clips (user_id, job_id, start_s, end_s, reason, description, "
                    "render_status) values (%s, %s, %s, %s, %s, %s, 'done') returning id",
                    (uid, job["id"], i * 30, i * 30 + 20, "seed", f"{hook}. {rest}"),
                ).fetchone()
                assert clip
                path = f"{tmp}/{clip['id']}.mp4"
                subprocess.run(
                    ["ffmpeg", "-loglevel", "error", "-y",
                     "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30",
                     "-f", "lavfi", "-i", f"sine=frequency={440 + 110 * i}",
                     "-t", "20", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
                     "-movflags", "+faststart", "-shortest", path],
                    check=True,
                )  # fmt: skip
                key = f"renders/{clip['id']}.mp4"
                r2.upload_file(key, path)
                c.execute("update clips set render_path = %s where id = %s", (key, clip["id"]))
                print(f"clip {clip['id']} -> {key}")


if __name__ == "__main__":
    clean() if sys.argv[1:] == ["clean"] else seed()
