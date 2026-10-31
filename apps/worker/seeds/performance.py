# Docs: docs/performance.md
"""Seed for plan 9: a fake YouTube connection, baselines from the recorded fixtures, 9 posted
clips with metrics (hygiene/short/question beat the baseline, money/long/story fall short),
learning run on them, and 1 recent post whose checkpoints are left for `pnpm checkpoints:run-now`.

`pnpm seed:performance` / `pnpm seed:performance:clean`. Idempotent (clean, then create). Tags:
job title `seed:performance` (clips, posts, metrics, checkpoints cascade), connection
account_name `seed:performance`, baseline_seeds external_id `fakeVid*`, performance rules whose
evidence points at seed posts. feature_weights + change_log of the seed user are derived from
the seed posts and are cleared too (use the dedicated SEED_EMAIL user). No R2 objects.
"""

import os
import sys
from datetime import UTC, datetime, timedelta

from psycopg.types.json import Jsonb

import ranking
from loops import checkpoints
from worker import db
from worker.crypto import encrypt

TAG = "seed:performance"
EMAIL = os.environ.get("SEED_EMAIL", "dev-perf@clip-studio.test")

# (description, features, duration_s, views / baseline median)
CLIPS = [
    ("Wash your hands for 20 seconds? Here's why.", ("hygiene", "short", "question"), 25, 3.1),
    ("Is your toothbrush dirtier than your phone?", ("hygiene", "short", "question"), 22, 2.6),
    ("Do you really need to shower every day?", ("hygiene", "short", "question"), 28, 2.2),
    ("How I paid off my loan, the long story.", ("money", "long", "story"), 95, 0.4),
    ("My first salary and what went wrong.", ("money", "long", "story"), 80, 0.5),
    ("The budgeting app that nearly ruined me.", ("money", "long", "story"), 110, 0.35),
    ("Three morning habits that stuck.", ("habits", "medium", "list"), 45, 1.1),
    ("Why I stopped drinking coffee.", ("habits", "medium", "story"), 50, 0.9),
    ("The one fridge rule everyone breaks.", ("kitchen", "short", "statement"), 30, 1.3),
]
PENDING = ("Should you wash new clothes before wearing them?", ("hygiene", "short", "question"), 26)


def user_id() -> str:
    with db.connect() as c:
        u = c.execute("select id from auth.users where email = %s", (EMAIL,)).fetchone()
    if not u:
        sys.exit(f"No user {EMAIL}. Sign in once via /auth/dev-login, then rerun.")
    return str(u["id"])


def clean() -> None:
    uid = user_id()
    with db.connect() as c:
        posts = [
            str(r["id"])
            for r in c.execute(
                "select p.id from posts p join clips cl on cl.id = p.clip_id "
                "join jobs j on j.id = cl.job_id where j.title = %s and j.user_id = %s",
                (TAG, uid),
            ).fetchall()
        ]
        rules = c.execute(
            "delete from brand_rules where user_id = %s and source = 'performance' "
            "and evidence->0->>'post_id' = any(%s)",
            (uid, posts),
        ).rowcount
        n = c.execute("delete from jobs where title = %s and user_id = %s", (TAG, uid)).rowcount
        c.execute(
            "delete from baseline_seeds where user_id = %s and external_id like 'fakeVid%%'",
            (uid,),
        )
        c.execute("delete from feature_weights where user_id = %s", (uid,))
        c.execute("delete from change_log where user_id = %s", (uid,))
        c.execute(
            "delete from platform_connections where user_id = %s and account_name = %s", (uid, TAG)
        )
    print(f"cleaned {n} seed job(s), {len(posts)} post(s), {rules} rule(s)")


def add_clip(c, uid: str, job_id: str, i: int, desc: str, feats: tuple, dur: float) -> str:
    topic, bucket, hook = feats
    row = c.execute(
        "insert into clips (user_id, job_id, start_s, end_s, reason, description, features) "
        "values (%s, %s, %s, %s, 'seed', %s, %s) returning id",
        (uid, job_id, i * 200, i * 200 + dur, desc,
         Jsonb({"topic": topic, "length_bucket": bucket, "hook_type": hook})),
    ).fetchone()  # fmt: skip
    assert row
    return str(row["id"])


def add_post(c, uid: str, clip_id: str, desc: str, i: int, posted_at: datetime) -> str:
    row = c.execute(
        "insert into posts (user_id, clip_id, platform, title, caption, status, scheduled_at, "
        "posted_at, external_id, external_url) values "
        "(%s, %s, 'youtube', %s, %s, 'posted', %s, %s, %s, %s) returning id",
        (uid, clip_id, desc[:100], desc, posted_at, posted_at, f"seedperf{i}",
         f"https://youtube.com/shorts/seedperf{i}"),
    ).fetchone()  # fmt: skip
    assert row
    return str(row["id"])


def seed() -> None:
    clean()
    uid = user_id()
    now = datetime.now(UTC)
    with db.connect() as c:
        iv, ct = encrypt("seed-fake-refresh-token")
        c.execute(
            "insert into platform_connections (user_id, platform, refresh_token_ciphertext, iv, "
            "account_name, channel_id) "
            "values (%s, 'youtube', %s, %s, %s, 'UCfakeChannel0000000000a') "
            "on conflict do nothing",
            (uid, ct, iv, TAG),
        )
    print(checkpoints.seed_baselines(uid))  # YOUTUBE_FAKE=true -> recorded fixtures

    with db.connect() as c:
        job = c.execute(
            "insert into jobs (user_id, status, source_key, title) "
            "values (%s, 'done', 'seed/performance', %s) returning id",
            (uid, TAG),
        ).fetchone()
        assert job
        for i, (desc, feats, dur, ratio) in enumerate(CLIPS):
            clip = add_clip(c, uid, job["id"], i, desc, feats, dur)
            post = add_post(c, uid, clip, desc, i, now - timedelta(days=95 - 6 * i))
            for cp in checkpoints.CHECKPOINT_DAYS:
                samples = checkpoints.baseline_samples(uid, cp, post)
                views = round(ranking.statistics.median(samples) * ratio) if samples else 100
                s = ranking.score(views, samples)
                c.execute(
                    "insert into post_metrics (user_id, post_id, checkpoint, views, likes, "
                    "comments, avg_view_pct, score, verdict) "
                    "values (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (uid, post, cp, views, views // 25, views // 200, 40 + 10 * ratio, s,
                     ranking.verdict(cp, s)),
                )  # fmt: skip
            c.execute(
                "update post_checkpoints set done_at = now() where post_id = %s and user_id = %s",
                (post, uid),
            )
        desc, feats, dur = PENDING
        clip = add_clip(c, uid, job["id"], len(CLIPS), desc, feats, dur)
        pending = add_post(c, uid, clip, desc, len(CLIPS), now - timedelta(days=8))
    checkpoints.learn(uid)
    print(f"seeded {len(CLIPS)} scored posts; run `pnpm checkpoints:run-now {pending}`")


if __name__ == "__main__":
    clean() if sys.argv[1:] == ["--clean"] else seed()
