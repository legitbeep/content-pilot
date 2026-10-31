# Docs: docs/pipeline.md
"""Clip ranking. STUB owned by plan 5 until plan 9 replaces this file (feature_weights,
exploration): ranking_score = mean of the candidate's scores, sorted best first."""


def apply_weights(user_id: str, candidates: list[dict]) -> list[dict]:
    """Each candidate has `scores` (name -> 0..1) and `features`; returns them ordered with
    `ranking_score` set."""
    for c in candidates:
        s = c["scores"]
        c["ranking_score"] = round(sum(s.values()) / len(s), 4) if s else 0.0
    return sorted(candidates, key=lambda c: c["ranking_score"], reverse=True)
