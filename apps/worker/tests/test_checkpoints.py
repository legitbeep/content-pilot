from datetime import date

import pytest

from loops import checkpoints
from worker import youtube, yt_stats


@pytest.fixture
def fake(monkeypatch):
    monkeypatch.setenv("YOUTUBE_FAKE", "true")


def test_recorded_responses_parse(fake):
    vids = yt_stats.recent_uploads("t")
    assert len(vids) == 20 and vids[0]["video_id"] == "fakeVid0000"
    daily = yt_stats.daily_views("t", "fakeVid0001", date(2026, 9, 1), date(2026, 9, 30))
    assert len(daily) == 30 and daily[0][0] == "2026-09-01"
    stats = yt_stats.video_stats("t", ["a", "b"])
    assert set(stats) == {"a", "b"} and stats["a"]["views"] > 0
    assert yt_stats.avg_view_pct("t", "a", date(2026, 9, 1), date(2026, 9, 30)) == 63.4


def test_views_at_sums_first_n_days():
    daily = [("2026-09-01", 100), ("2026-09-02", 50), ("2026-09-03", 25)]
    assert checkpoints.views_at(daily, date(2026, 9, 1), 2) == 150
    assert checkpoints.reached(date(2026, 9, 1), 30, date(2026, 10, 4))
    assert not checkpoints.reached(date(2026, 9, 1), 30, date(2026, 10, 3))  # reporting lag


def test_process_records_score(monkeypatch, fake):
    written = {}
    monkeypatch.setattr(checkpoints, "finish", lambda cp, error=None: written.update(err=error))
    monkeypatch.setattr(checkpoints, "baseline_samples", lambda u, cp, p: [100] * 5)
    monkeypatch.setattr(checkpoints, "learn", lambda u: written.update(learned=u))

    class Conn:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def execute(self, sql, params=None):
            written.setdefault("sql", []).append((sql, params))
            return self

        def fetchone(self):
            return {"id": "p1", "status": "posted", "external_id": "vid",
                    "posted_at": __import__("datetime").datetime(2026, 9, 1)}  # fmt: skip

    monkeypatch.setattr(checkpoints.db, "connect", Conn)
    monkeypatch.setattr(
        yt_stats, "video_stats", lambda t, ids: {"vid": {"views": 250, "likes": 3, "comments": 1}}
    )
    out = checkpoints.process(
        {"id": "c1", "user_id": "u1", "post_id": "p1", "checkpoint": "7d", "attempts": 1}
    )
    assert out == "7d views=250 score=2.5 verdict=boost"
    assert written["learned"] == "u1" and written["err"] is None


def test_process_reconnect_needed_retries(monkeypatch, fake):
    monkeypatch.setattr(checkpoints, "fail", lambda cp, e: f"failed: {e}")

    class Conn:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def execute(self, *a):
            return self

        def fetchone(self):
            return {"id": "p1", "status": "posted", "external_id": "vid", "posted_at": None}

    monkeypatch.setattr(checkpoints.db, "connect", Conn)

    def boom(t, ids):
        raise youtube.ReconnectNeeded("invalid_grant")

    monkeypatch.setattr(yt_stats, "video_stats", boom)
    out = checkpoints.process(
        {"id": "c1", "user_id": "u1", "post_id": "p1", "checkpoint": "48h", "attempts": 1}
    )
    assert "Reconnect" in out


def test_youtube_fake_is_ignored_inside_docker(monkeypatch):
    monkeypatch.setenv("YOUTUBE_FAKE", "true")
    assert yt_stats.fake() is True  # local uv run (no /.dockerenv here)
    monkeypatch.setattr(yt_stats, "Path", lambda p: type("P", (), {"exists": lambda s: True})())
    assert yt_stats.fake() is False  # production worker image
