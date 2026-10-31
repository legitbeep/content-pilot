# Docs: docs/performance.md
"""Performance scoring + learned ranking. Pure helpers (score, verdict, weights) plus
`apply_weights`, which extract_clips (plan 5) calls to order candidates."""

import random
import statistics
from typing import Any

MIN_SAMPLES = 5  # below this a checkpoint has no baseline: score null, no verdict
SAMPLE_WINDOW = 20  # newest samples (own posts + baseline seeds) per checkpoint
WEIGHT_WINDOW = 10  # moving average over a feature's last 10 scored posts
BOOST, DOWNGRADE = 1.5, 0.6
VERDICT_CHECKPOINTS = ("7d", "30d")  # 7d provisional, 30d final
EXPLORE_EVERY, EXPLORE_OFFSET = 7, 2  # slots 2, 9, 16, ... (~15%) ignore weights
MIN_MULT, MAX_MULT = 0.5, 2.0
RULE_MIN_POSTS = 3  # same feature + same verdict on 3 posts -> candidate rule


def score(views: int, samples: list[int]) -> float | None:
    """views / median of the newest samples; None (insufficient_data) with < 5 samples."""
    if len(samples) < MIN_SAMPLES:
        return None
    base = statistics.median(samples)
    return round(views / base, 3) if base > 0 else None


def verdict(checkpoint: str, s: float | None) -> str | None:
    if s is None or checkpoint not in VERDICT_CHECKPOINTS:
        return None
    return "boost" if s > BOOST else "downgrade" if s < DOWNGRADE else "neutral"


def length_bucket(duration_s: float) -> str:
    return "short" if duration_s <= 30 else "medium" if duration_s <= 60 else "long"


def clip_features(clip: dict) -> list[str]:
    """Feature keys from clips.features {topic, length_bucket, hook_type}; length falls back to
    the clip's duration."""
    f = clip.get("features") or {}
    out = []
    if f.get("topic"):
        out.append(f"topic:{str(f['topic']).strip().lower()}")
    bucket = f.get("length_bucket")
    if not bucket and clip.get("end_s") is not None and clip.get("start_s") is not None:
        bucket = length_bucket(float(clip["end_s"]) - float(clip["start_s"]))
    if bucket:
        out.append(f"length:{bucket}")
    if f.get("hook_type"):
        out.append(f"hook:{str(f['hook_type']).strip().lower()}")
    return out


def feature_label(feature: str) -> str:
    kind, _, value = feature.partition(":")
    if kind == "topic":
        return f"Clips about {value}"
    if kind == "length":
        return {"short": "Short clips (30s or less)", "medium": "30-60s clips"}.get(
            value, "Clips over 60s"
        )
    if kind == "hook":
        return f"Clips that open with a {value} hook"
    return feature


def moving_average(scores: list[float]) -> float:
    """Simple moving average of the last WEIGHT_WINDOW scores (oldest first)."""
    window = scores[-WEIGHT_WINDOW:]
    return round(sum(window) / len(window), 3)


def band(weight: float, samples: int) -> str | None:
    """A weight only counts as a pattern with 2+ posts behind it."""
    if samples < 2:
        return None
    return "boost" if weight > BOOST else "downgrade" if weight < DOWNGRADE else None


def feature_history(rows: list[dict]) -> dict[str, list[dict]]:
    """rows: one per (post, verdict checkpoint), ordered by posted_at then checkpoint. Each post
    counts once, with its latest verdict (30d final replaces 7d provisional).
    -> {feature: [{post_id, score, verdict}, ...]} oldest post first."""
    latest: dict[str, dict] = {}
    for r in rows:
        latest[r["post_id"]] = r  # dicts keep first-insertion order = posted_at order
    out: dict[str, list[dict]] = {}
    for r in latest.values():
        item = {"post_id": r["post_id"], "score": float(r["score"]), "verdict": r["verdict"]}
        for f in clip_features(r):
            out.setdefault(f, []).append(item)
    return out


def weight_message(feature: str, weight: float, band_: str) -> str:
    action = "Ranking them higher." if band_ == "boost" else "Ranking them lower."
    return f"{feature_label(feature)} got {weight:.1f}x your usual views. {action}"


def rule_text(feature: str, verdict: str, scores: list[float]) -> str:
    avg = sum(scores) / len(scores)
    label = feature_label(feature)
    label = label[0].lower() + label[1:]
    if verdict == "boost":
        return f"Favour {label}: {len(scores)} posts got {avg:.1f}x your usual views."
    return f"Avoid {label}: {len(scores)} posts got only {avg:.1f}x your usual views."


def multiplier(weights: dict[str, float], features: list[str]) -> float:
    m = 1.0
    for f in features:
        m *= min(max(weights.get(f, 1.0), MIN_MULT), MAX_MULT)
    return m


def base_score(scores: Any) -> float:
    if isinstance(scores, dict):
        scores = list(scores.values())
    if isinstance(scores, (int, float)):
        return float(scores)
    nums = [float(v) for v in scores or [] if isinstance(v, (int, float))]
    return sum(nums) / len(nums) if nums else 0.0


def _candidate_features(c: dict) -> list[str]:
    return clip_features(
        {"features": c.get("features"), **{k: c.get(k) for k in ("start_s", "end_s")}}
    )


def load_weights(user_id: str) -> dict[str, float]:
    from worker import db

    with db.connect() as c:
        rows = c.execute(
            "select feature, weight from feature_weights where user_id = %s", (user_id,)
        ).fetchall()
    return {r["feature"]: float(r["weight"]) for r in rows}


def apply_weights(
    user_id: str,
    candidates: list[dict],
    *,
    weights: dict[str, float] | None = None,
    rng: random.Random | None = None,
) -> list[dict]:
    """Set ranking_score = mean(scores) x clamped feature weights and order by it. Every 7th slot
    (from index 2) is an exploration pick: a random remaining candidate, regardless of weights,
    marked `explore: True`."""
    if weights is None:
        weights = load_weights(user_id)
    rng = rng or random.Random()
    for c in candidates:
        c["ranking_score"] = round(
            base_score(c.get("scores")) * multiplier(weights, _candidate_features(c)), 4
        )
    rest = sorted(candidates, key=lambda c: c["ranking_score"], reverse=True)
    out: list[dict] = []
    while rest:
        explore = len(out) % EXPLORE_EVERY == EXPLORE_OFFSET
        c = rest.pop(rng.randrange(len(rest)) if explore else 0)
        c["explore"] = explore
        out.append(c)
    return out
