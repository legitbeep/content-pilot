# Docs: docs/performance.md
"""Checkpoints loop: seed baselines for new YouTube connections, then process due post
checkpoints (48h/7d/14d/30d): fetch stats -> post_metrics with score + verdict -> learn
(feature_weights, change_log, performance candidate rules)."""

import logging
import time
from datetime import UTC, date, datetime, timedelta

import ranking
from worker import db, youtube, yt_stats

log = logging.getLogger("checkpoints")

POLL_SECONDS = 300
MAX_ATTEMPTS = 5
REPORTING_LAG_DAYS = 3  # Analytics data lags ~2-3 days
CHECKPOINT_DAYS = {"48h": 2, "7d": 7, "14d": 14, "30d": 30}

# id given (run_once): that post's next undone checkpoint, even if not due yet.
CLAIM_SQL = """
update post_checkpoints set claimed_at = now(), attempts = attempts + 1
where id = (select id from post_checkpoints
            where done_at is null
              and (case when %(post)s::uuid is null then due_at <= now()
                        else post_id = %(post)s::uuid end)
              and (claimed_at is null or claimed_at < now() - interval '10 minutes')
            order by due_at
            for update skip locked limit 1)
returning *
"""

SAMPLES_SQL = """
select views from (
  select m.views, p.posted_at as at from post_metrics m join posts p on p.id = m.post_id
  where m.user_id = %(u)s and m.checkpoint = %(cp)s and m.post_id <> %(post)s
  union all
  select views, published_at from baseline_seeds
  where user_id = %(u)s and platform = 'youtube' and checkpoint = %(cp)s
) s order by at desc limit %(n)s
"""


# --- baselines --------------------------------------------------------------------------------


def views_at(daily: list[tuple[str, int]], published: date, days: int) -> int:
    end = published + timedelta(days=days)
    return sum(v for d, v in daily if date.fromisoformat(d) < end)


def reached(published: date, days: int, today: date) -> bool:
    return published + timedelta(days=days + REPORTING_LAG_DAYS) <= today


def seed_baselines(user_id: str) -> str:
    """Last 20 uploads -> baseline_seeds per reached checkpoint. Daily views via Analytics;
    if Analytics fails, the current total views for every reached checkpoint."""
    token = yt_stats.token_for(user_id)
    videos = yt_stats.recent_uploads(token)
    today = datetime.now(UTC).date()
    rows: list[tuple[str, str, int, str]] = []
    method = "analytics"
    try:
        for v in videos:
            pub = datetime.fromisoformat(v["published_at"].replace("Z", "+00:00")).date()
            cps = [cp for cp, d in CHECKPOINT_DAYS.items() if reached(pub, d, today)]
            if not cps:
                continue
            daily = yt_stats.daily_views(token, v["video_id"], pub, pub + timedelta(days=29))
            rows += [(v["video_id"], cp, views_at(daily, pub, CHECKPOINT_DAYS[cp]),
                      v["published_at"]) for cp in cps]  # fmt: skip
    except youtube.YouTubeError as e:
        log.warning("baselines %s: analytics failed, using total views: %s", user_id, e.detail)
        method, rows = "total_views", []
        stats = yt_stats.video_stats(token, [v["video_id"] for v in videos]) if videos else {}
        for v in videos:
            pub = datetime.fromisoformat(v["published_at"].replace("Z", "+00:00")).date()
            total = stats.get(v["video_id"], {}).get("views")
            if total is None:
                continue
            rows += [(v["video_id"], cp, total, v["published_at"])
                     for cp, d in CHECKPOINT_DAYS.items() if reached(pub, d, today)]  # fmt: skip
    with db.connect() as c:
        for vid, cp, views, pub in rows:
            c.execute(
                "insert into baseline_seeds (user_id, platform, external_id, checkpoint, views, "
                "published_at) values (%s, 'youtube', %s, %s, %s, %s) "
                "on conflict (user_id, platform, external_id, checkpoint) "
                "do update set views = excluded.views, captured_at = now()",
                (user_id, vid, cp, views, pub),
            )
        c.execute(
            "update platform_connections set baselines_seeded_at = now(), baseline_method = %s "
            "where user_id = %s and platform = 'youtube'",
            (method, user_id),
        )
    return f"seeded {len(rows)} baseline values from {len(videos)} videos ({method})"


def seed_pending_baselines() -> None:
    with db.connect() as c:
        users = c.execute(
            "select user_id from platform_connections "
            "where platform = 'youtube' and baselines_seeded_at is null"
        ).fetchall()
    for u in users:
        try:
            log.info("baselines %s: %s", u["user_id"], seed_baselines(u["user_id"]))
        except Exception as e:
            log.warning("baselines %s failed: %r", u["user_id"], e)
            with db.connect() as c:  # don't retry every tick; reconnecting resets it
                c.execute(
                    "update platform_connections set baselines_seeded_at = now(), "
                    "baseline_method = 'failed' where user_id = %s and platform = 'youtube'",
                    (u["user_id"],),
                )


# --- checkpoints ------------------------------------------------------------------------------


def claim(post_id: str | None = None) -> dict | None:
    with db.connect() as c:
        return c.execute(CLAIM_SQL, {"post": post_id}).fetchone()


def finish(cp: dict, error: str | None = None) -> None:
    with db.connect() as c:
        c.execute(
            "update post_checkpoints set done_at = now(), error = %s "
            "where id = %s and user_id = %s",
            (error, cp["id"], cp["user_id"]),
        )


def fail(cp: dict, error: str) -> str:
    """Retry after the claim times out (10 min) until MAX_ATTEMPTS, then give up."""
    if cp["attempts"] >= MAX_ATTEMPTS:
        finish(cp, error)
    else:
        with db.connect() as c:
            c.execute("update post_checkpoints set error = %s where id = %s", (error, cp["id"]))
    return f"failed: {error}"


def baseline_samples(user_id: str, checkpoint: str, post_id: str) -> list[int]:
    with db.connect() as c:
        rows = c.execute(
            SAMPLES_SQL,
            {"u": user_id, "cp": checkpoint, "post": post_id, "n": ranking.SAMPLE_WINDOW},
        ).fetchall()
    return [int(r["views"]) for r in rows]


def process(cp: dict) -> str:
    uid = cp["user_id"]
    with db.connect() as c:
        post = c.execute(
            "select id, status, external_id, posted_at from posts where id = %s and user_id = %s",
            (cp["post_id"], uid),
        ).fetchone()
    if not post or post["status"] != "posted" or not post["external_id"]:
        finish(cp, "The post isn't live on YouTube.")
        return "failed: post not live"
    vid = post["external_id"]
    try:
        token = yt_stats.token_for(uid)
        stats = yt_stats.video_stats(token, [vid]).get(vid)
        if not stats:
            finish(cp, "The video is no longer on YouTube.")
            return "failed: video gone"
        try:
            pct = yt_stats.avg_view_pct(token, vid, post["posted_at"].date(), date.today())
        except youtube.YouTubeError:
            pct = None  # optional metric
    except youtube.ReconnectNeeded:
        return fail(cp, "YouTube access expired. Reconnect in Settings.")
    except youtube.YouTubeError as e:
        return fail(cp, e.message)

    samples = baseline_samples(uid, cp["checkpoint"], post["id"])
    s = ranking.score(stats["views"], samples)
    v = ranking.verdict(cp["checkpoint"], s)
    with db.connect() as c:
        c.execute(
            "insert into post_metrics (user_id, post_id, checkpoint, views, likes, comments, "
            "avg_view_pct, score, verdict) values (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "on conflict (post_id, checkpoint) do update set views = excluded.views, "
            "likes = excluded.likes, comments = excluded.comments, "
            "avg_view_pct = excluded.avg_view_pct, score = excluded.score, "
            "verdict = excluded.verdict, captured_at = now()",
            (uid, post["id"], cp["checkpoint"], stats["views"], stats["likes"],
             stats["comments"], pct, s, v),
        )  # fmt: skip
    finish(cp)
    if v:
        learn(uid)
    shown = "insufficient_data" if s is None else f"score={s} verdict={v or '-'}"
    return f"{cp['checkpoint']} views={stats['views']} {shown}"


# --- learning ---------------------------------------------------------------------------------

HISTORY_SQL = """
select p.id::text as post_id, c.features, c.start_s, c.end_s, m.checkpoint::text, m.score, m.verdict
from posts p join clips c on c.id = p.clip_id join post_metrics m on m.post_id = p.id
where p.user_id = %s and m.verdict is not null
order by p.posted_at, m.checkpoint
"""


def learn(user_id: str) -> None:
    """Recompute feature_weights from every scored post; log band changes; propose rules."""
    with db.connect() as c:
        rows = c.execute(HISTORY_SQL, (user_id,)).fetchall()
        old = {
            r["feature"]: (float(r["weight"]), r["samples"])
            for r in c.execute(
                "select feature, weight, samples from feature_weights where user_id = %s",
                (user_id,),
            ).fetchall()
        }
        for feature, hist in ranking.feature_history(rows).items():
            w = ranking.moving_average([h["score"] for h in hist])
            n = len(hist)
            c.execute(
                "insert into feature_weights (user_id, feature, weight, samples) "
                "values (%s, %s, %s, %s) on conflict (user_id, feature) do update set "
                "weight = excluded.weight, samples = excluded.samples, updated_at = now()",
                (user_id, feature, w, n),
            )
            new_band = ranking.band(w, n)
            if new_band and new_band != ranking.band(*old.get(feature, (1.0, 0))):
                c.execute(
                    "insert into change_log (user_id, kind, feature, message, data) "
                    "values (%s, 'weight', %s, %s, %s)",
                    (user_id, feature, ranking.weight_message(feature, w, new_band),
                     db.Jsonb({"weight": w, "samples": n, "band": new_band})),
                )  # fmt: skip
            for verdict in ("boost", "downgrade"):
                same = [h for h in hist if h["verdict"] == verdict]
                if len(same) >= ranking.RULE_MIN_POSTS:
                    propose_rule(c, user_id, feature, verdict, same)


def propose_rule(c, user_id: str, feature: str, verdict: str, hist: list[dict]) -> None:
    """Candidate only (never active): plan 7's /brand review promotes it. Dedupe on
    evidence[0].feature + verdict; a rule the user already accepted or archived is left alone."""
    evidence = [{"kind": "performance", "post_id": h["post_id"], "feature": feature,
                 "verdict": verdict} for h in hist]  # fmt: skip
    found = c.execute(
        "select id, status::text, evidence from brand_rules where user_id = %s "
        "and source = 'performance' and evidence->0->>'feature' = %s "
        "and evidence->0->>'verdict' = %s",
        (user_id, feature, verdict),
    ).fetchall()
    if any(r["status"] != "candidate" for r in found):
        return
    if found:
        r = found[0]
        have = {e.get("post_id") for e in r["evidence"]}
        new = [e for e in evidence if e["post_id"] not in have]
        if new:
            merged = r["evidence"] + new
            c.execute(
                "update brand_rules set evidence = %s, evidence_count = %s, updated_at = now() "
                "where id = %s and user_id = %s",
                (db.Jsonb(merged), len(merged), r["id"], user_id),
            )
        return
    text = ranking.rule_text(feature, verdict, [h["score"] for h in hist])
    c.execute(
        "insert into brand_rules (user_id, source, status, scope, rule, evidence, evidence_count) "
        "values (%s, 'performance', 'candidate', 'clip_selection', %s, %s, %s)",
        (user_id, text, db.Jsonb(evidence), len(evidence)),
    )
    c.execute(
        "insert into change_log (user_id, kind, feature, message, data) values "
        "(%s, 'rule', %s, %s, %s)",
        (user_id, feature, f"New rule suggestion: {text} Review it in Brand memory.",
         db.Jsonb({"verdict": verdict, "posts": len(evidence)})),
    )  # fmt: skip


# --- entry points -----------------------------------------------------------------------------


def run_once(post_id: str) -> str:
    cp = claim(post_id)
    if not cp:
        return "failed: no undone checkpoint for that post (not posted, or all done)"
    return process(cp)


def tick() -> None:
    seed_pending_baselines()
    while cp := claim():
        try:
            log.info("checkpoint %s: %s", cp["id"], process(cp))
        except Exception:
            log.exception("checkpoint %s crashed", cp["id"])


def loop() -> None:
    while True:
        try:
            tick()
        except Exception:
            log.exception("checkpoints tick failed")
        time.sleep(POLL_SECONDS)
