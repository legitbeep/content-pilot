import random

import ranking


def test_score_needs_five_samples():
    assert ranking.score(300, [100, 100, 100, 100]) is None
    assert ranking.score(300, [100, 50, 100, 200, 100]) == 3.0
    assert ranking.score(10, [0, 0, 0, 0, 0]) is None


def test_verdict_thresholds_and_checkpoints():
    assert ranking.verdict("30d", 1.6) == "boost"
    assert ranking.verdict("7d", 0.5) == "downgrade"
    assert ranking.verdict("30d", 1.5) == "neutral"
    assert ranking.verdict("30d", 0.6) == "neutral"
    assert ranking.verdict("48h", 3.0) is None  # no verdict before 7d
    assert ranking.verdict("30d", None) is None  # insufficient_data


def test_clip_features_with_length_fallback():
    assert ranking.clip_features(
        {"features": {"topic": "Hygiene", "length_bucket": "short", "hook_type": "question"}}
    ) == ["topic:hygiene", "length:short", "hook:question"]
    assert ranking.clip_features({"features": None, "start_s": 0, "end_s": 45}) == ["length:medium"]


def test_weight_update_uses_latest_verdict_and_moving_average():
    rows = [
        {"post_id": "a", "features": {"topic": "x"}, "score": 1.0, "verdict": "neutral"},
        {"post_id": "a", "features": {"topic": "x"}, "score": 3.0, "verdict": "boost"},  # 30d
        {"post_id": "b", "features": {"topic": "x"}, "score": 2.0, "verdict": "boost"},
    ]
    hist = ranking.feature_history(rows)["topic:x"]
    assert [h["post_id"] for h in hist] == ["a", "b"]
    assert ranking.moving_average([h["score"] for h in hist]) == 2.5
    assert ranking.moving_average([0.0] * 5 + [1.0] * 10) == 1.0  # window of 10
    assert ranking.band(2.5, 2) == "boost" and ranking.band(2.5, 1) is None
    assert ranking.band(0.4, 3) == "downgrade" and ranking.band(1.0, 3) is None
    assert ranking.weight_message("length:short", 3.0, "boost") == (
        "Short clips (30s or less) got 3.0x your usual views. Ranking them higher."
    )
    assert ranking.rule_text("topic:hygiene", "boost", [2.0, 3.0, 4.0]).startswith(
        "Favour clips about hygiene: 3 posts got 3.0x"
    )


def cands(n):
    return [{"id": i, "scores": {"a": n - i, "b": n - i}, "features": {}} for i in range(n)]


def test_apply_weights_without_weights_keeps_score_order_except_exploration():
    out = ranking.apply_weights("u", cands(10), weights={}, rng=random.Random(1))
    assert [c["ranking_score"] for c in out[:2]] == [10, 9]
    assert [c["explore"] for c in out].count(True) == 2  # slots 2 and 9 of 10
    assert out[2]["explore"] and out[9]["explore"]
    rest = [c["ranking_score"] for c in out if not c["explore"]]
    assert rest == sorted(rest, reverse=True)


def test_apply_weights_boosts_and_downgrades_by_feature():
    c = [
        {"id": "plain", "scores": [0.8], "features": {"topic": "money"}},
        {"id": "boosted", "scores": [0.5], "features": {"topic": "hygiene"}},
        {"id": "down", "scores": [0.9], "features": {"topic": "drama", "length_bucket": "long"}},
    ]
    w = {"topic:hygiene": 3.0, "topic:drama": 0.2, "length:long": 1.0}
    out = ranking.apply_weights("u", c, weights=w, rng=random.Random(0))
    by = {x["id"]: x["ranking_score"] for x in out}
    assert by == {"plain": 0.8, "boosted": 1.0, "down": 0.45}  # multiplier clamped to 0.5..2
    assert [x["id"] for x in out[:2]] == ["boosted", "plain"] and out[2]["explore"]


def test_exploration_share_is_about_15_percent():
    out = ranking.apply_weights("u", cands(70), weights={}, rng=random.Random(2))
    assert sum(c["explore"] for c in out) == 10  # 1 in 7
