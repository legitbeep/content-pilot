# Docs: docs/timeline.md
"""Seed data for the editor (plan 6): one done job with 3 selected clips (ffmpeg test videos with
handles, word slices, initial timelines), a voiceover and a music track in R2.

`pnpm seed:editor` / `pnpm seed:editor:clean`. Idempotent: ids are uuid5 of the user, the job is
tagged `note = 'seed:editor'`, and clean removes exactly those rows and R2 objects. The user is
SEED_EMAIL (default: the dev-login test user; sign in once via /auth/dev-login to create it).
"""

import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from psycopg.types.json import Jsonb

from worker import db, r2

TAG = "seed:editor"
NS = uuid.UUID("6e1d2c3b-6a5f-4e00-9d0e-ed170000c0de")
FILE_S = 20.0  # clip file length (10s clip + 5s handles each side)
WORDS = "so here is the thing nobody tells you about making short clips that people watch".split()

# (label, lavfi video, tone Hz, source start_s)
CLIPS = [
    ("one", "testsrc2=size=720x1280:rate=30", 440, 105.0),
    ("two", "smptebars=size=1280x720:rate=30", 660, 205.0),
    ("three", "testsrc2=size=1280x720:rate=30,hue=h=180", 330, 305.0),
]


def user_id() -> str:
    email = os.environ.get("SEED_EMAIL", "dev@clip-studio.test")
    with db.connect() as c:
        row = c.execute("select id from auth.users where email = %s", (email,)).fetchone()
    if not row:
        sys.exit(f"No user {email}. Sign in once via /auth/dev-login (or set SEED_EMAIL).")
    return str(row["id"])


def ids(uid: str) -> tuple[str, list[str]]:
    job = str(uuid.uuid5(NS, f"{uid}:job"))
    return job, [str(uuid.uuid5(NS, f"{uid}:clip:{label}")) for label, *_ in CLIPS]


def audio_keys(uid: str) -> dict[str, str]:
    return {k: f"uploads/{uid}/seed-editor/{k}.m4a" for k in ("voiceover", "music")}


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def words(label: str) -> list[dict]:
    out, t, i = [], 0.2, 0
    while t + 0.4 < FILE_S:
        w = f"{label}" if i % 6 == 0 else WORDS[i % len(WORDS)]
        out.append({"w": w, "start": round(t, 2), "end": round(t + 0.4, 2)})
        t, i = t + 0.5, i + 1
    return out


def timeline(key: str) -> dict:
    return {
        "version": 2,
        "sourceKey": key,
        "aspect": "9:16",
        "cropX": 0.5,
        "segments": [{"start": 5, "end": 15}],
        "originalAudio": {"muted": False, "volume": 1},
        "audio": [],
        "ducking": False,
        "captions": {
            "enabled": True,
            "style": {
                "font": "Hanken Grotesk",
                "color": "#FFFFFF",
                "position": "bottom",
                "size": "medium",
                "wordsPerChunk": 3,
            },
        },
        "textOverlays": [],
        "blurRegions": [],
    }


def seed() -> None:
    uid = user_id()
    job_id, clip_ids = ids(uid)
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        for (label, video, hz, _), cid in zip(CLIPS, clip_ids, strict=True):
            out = str(d / f"{label}.mp4")
            ffmpeg(
                "-f", "lavfi", "-i", video, "-f", "lavfi", "-i", f"sine=frequency={hz}",
                "-t", str(FILE_S), "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-movflags", "+faststart", out,
            )  # fmt: skip
            r2.upload_file(out, f"clips/{cid}/source.mp4", "video/mp4")
        keys = audio_keys(uid)
        sources = {
            "voiceover": "sine=frequency=300,tremolo=f=4:d=0.8",
            "music": "aevalsrc=0.3*sin(2*PI*523*t)+0.3*sin(2*PI*659*t):s=48000",
        }
        for kind, src in sources.items():
            out = str(d / f"{kind}.m4a")
            dur = "8" if kind == "voiceover" else "30"
            ffmpeg("-f", "lavfi", "-i", src, "-t", dur, "-c:a", "aac", out)
            r2.upload_file(out, keys[kind], "audio/mp4")

    with db.connect() as c:
        c.execute(
            """insert into jobs (id, user_id, status, source_key, title, note, duration_s,
                                 progress, finished_at, source_deleted_at)
               values (%s, %s, 'done', %s, 'Seed: editor session', %s, 600, 100, now(), now())
               on conflict (id) do update set status = 'done', note = excluded.note""",
            (job_id, uid, f"uploads/{uid}/seed-editor/source.mp4", TAG),
        )
        for (label, _, _, start), cid in zip(CLIPS, clip_ids, strict=True):
            key = f"clips/{cid}/source.mp4"
            c.execute(
                """insert into clips (id, user_id, job_id, start_s, end_s, reason, score, file_key,
                                      file_start_s, file_end_s, words, selected)
                   values (%s, %s, %s, %s, %s, %s, 0.8, %s, %s, %s, %s, true)
                   on conflict (id) do update set file_key = excluded.file_key,
                     words = excluded.words, selected = true, render_status = null,
                     render_path = null, render_error = null, rendered_at = null""",
                (
                    cid, uid, job_id, start, start + 10, f"Seed clip {label}: test pattern",
                    key, start - 5, start + 15, Jsonb(words(label)),
                ),
            )  # fmt: skip
            c.execute(
                """insert into timelines (user_id, clip_id, data, revision)
                   values (%s, %s, %s, 1)
                   on conflict (clip_id) do update set data = excluded.data, revision = 1,
                     rendered_key = null, rendered_revision = null, updated_at = now()""",
                (uid, cid, Jsonb(timeline(key))),
            )
            c.execute("delete from edit_events where clip_id = %s and user_id = %s", (cid, uid))
    print(f"seeded job {job_id}; open /editor/{clip_ids[0]}")
    print(f"audio: {audio_keys(uid)}")


def clean() -> None:
    uid = user_id()
    job_id, clip_ids = ids(uid)
    for cid in clip_ids:
        r2.delete(f"clips/{cid}/source.mp4")
        r2.delete(f"renders/{cid}.mp4")
    for key in audio_keys(uid).values():
        r2.delete(key)
    with db.connect() as c:  # cascades to clips, timelines, edit_events
        c.execute(
            "delete from jobs where id = %s and user_id = %s and note = %s", (job_id, uid, TAG)
        )
    print(f"cleaned job {job_id}")


if __name__ == "__main__":
    clean() if "--clean" in sys.argv else seed()
