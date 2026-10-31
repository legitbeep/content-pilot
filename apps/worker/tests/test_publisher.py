import pytest

from loops import publisher
from worker import youtube


@pytest.fixture
def env(monkeypatch):
    writes: list[dict] = []
    monkeypatch.setattr(publisher, "update_post", lambda post, **f: writes.append(f))
    monkeypatch.setattr(
        publisher,
        "_load",
        lambda post: (
            {"render_path": "renders/c.mp4"},
            {"refresh_token_ciphertext": b"", "iv": b""},
        ),
    )
    monkeypatch.setattr(publisher, "decrypt", lambda ct, iv: "refresh")
    monkeypatch.setattr(publisher.youtube, "access_token", lambda rt: "access")
    monkeypatch.setattr(publisher.r2, "download_file", lambda key, path: None)
    monkeypatch.setattr(
        publisher, "probe", lambda path: {"width": 1080, "height": 1920, "duration_s": 20.0}
    )
    return writes


def post(attempts=1):
    return {"id": "p1", "user_id": "u1", "clip_id": "c1", "attempts": attempts,
            "title": "Hook", "caption": "Desc", "tags": ["a"]}  # fmt: skip


def test_posts_short_with_tag(monkeypatch, env):
    seen = {}
    monkeypatch.setattr(
        publisher.youtube, "upload", lambda t, p, title, d, tags: seen.update(d=d) or "vid"
    )
    assert publisher.publish(post()) == "posted"
    assert seen["d"].endswith("#Shorts")
    assert env[-1]["external_url"] == "https://youtube.com/shorts/vid"


def test_revoked_token_fails_with_reconnect_message(monkeypatch, env):
    def boom(rt):
        raise youtube.ReconnectNeeded("invalid_grant")

    monkeypatch.setattr(publisher.youtube, "access_token", boom)
    assert publisher.publish(post()) == "failed"
    assert env[-1] == {"status": "failed", "error": publisher.RECONNECT}


def test_retries_with_backoff_then_fails(monkeypatch, env):
    def boom(*a):
        raise youtube.YouTubeError("YouTube upload failed (503).")

    monkeypatch.setattr(publisher.youtube, "upload", boom)
    assert publisher.publish(post(1)) == "scheduled"
    assert "attempt 1 of 3" in env[-1]["error"]
    assert publisher.publish(post(3)) == "failed"
    assert env[-1]["error"].endswith("Retry from the calendar.")


def test_non_retryable_fails_at_once(monkeypatch, env):
    def boom(*a):
        raise youtube.YouTubeError("quota", retry=False)

    monkeypatch.setattr(publisher.youtube, "upload", boom)
    assert publisher.publish(post(1)) == "failed"


def test_shorts_rules():
    assert publisher.is_short({"width": 1080, "height": 1920, "duration_s": 180})
    assert not publisher.is_short({"width": 1920, "height": 1080, "duration_s": 30})
    assert not publisher.is_short({"width": 1080, "height": 1920, "duration_s": 181})
    assert publisher.with_shorts_tag("x #shorts") == "x #shorts"


def test_http_error_mapping():
    assert isinstance(
        youtube._http_error(400, '{"error":"invalid_grant"}'), youtube.ReconnectNeeded
    )
    e = youtube._http_error(401, '{"error":"invalid_client"}')
    assert isinstance(e, youtube.YouTubeError) and not e.retry
    e = youtube._http_error(403, "quotaExceeded")
    assert isinstance(e, youtube.YouTubeError) and not e.retry
    assert youtube._http_error(503, "").retry  # type: ignore[union-attr]
