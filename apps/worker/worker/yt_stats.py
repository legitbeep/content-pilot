# Docs: docs/performance.md
"""Read-only YouTube client for performance: the channel's recent uploads, per-video daily views
(Analytics `reports.query`, dimensions=day, filters=video==ID), video statistics and average view
percentage. Endpoints checked 2026-11-01 (developers.google.com/youtube/v3,
developers.google.com/youtube/analytics/channel_reports).

`YOUTUBE_FAKE=true` (dev seeds, `pnpm checkpoints:run-now`) answers every request from the
recorded responses in `tests/fixtures/youtube/` instead of calling Google; tests swap `_get`."""

import hashlib
import json
import os
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from worker import db, youtube
from worker.crypto import decrypt

DATA = "https://www.googleapis.com/youtube/v3"
ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports"
FIXTURES = Path(__file__).parent.parent / "tests" / "fixtures" / "youtube"


def fake() -> bool:
    return os.environ.get("YOUTUBE_FAKE", "").lower() == "true"


def _get(url: str, token: str) -> dict:
    if fake():
        return fake_response(url)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with youtube._send(req) as r:
        return json.load(r)


def _url(base: str, **params) -> str:
    return f"{base}?{urllib.parse.urlencode(params)}"


def token_for(user_id: str) -> str:
    """Fresh access token from the user's stored YouTube refresh token."""
    if fake():
        return "fake-token"
    with db.connect() as c:
        conn = c.execute(
            "select refresh_token_ciphertext, iv from platform_connections "
            "where user_id = %s and platform = 'youtube'",
            (user_id,),
        ).fetchone()
    if not conn:
        raise youtube.YouTubeError("YouTube isn't connected.", retry=False)
    return youtube.access_token(decrypt(conn["refresh_token_ciphertext"], conn["iv"]))


def recent_uploads(token: str, n: int = 20) -> list[dict]:
    """[{video_id, published_at (ISO)}], newest first."""
    ch = _get(_url(f"{DATA}/channels", part="contentDetails", mine="true"), token)
    items = ch.get("items") or []
    if not items:
        return []
    uploads = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]
    pl = _get(
        _url(f"{DATA}/playlistItems", part="contentDetails", playlistId=uploads, maxResults=n),
        token,
    )
    return [
        {"video_id": i["contentDetails"]["videoId"],
         "published_at": i["contentDetails"]["videoPublishedAt"]}
        for i in pl.get("items") or []
    ]  # fmt: skip


def daily_views(token: str, video_id: str, start: date, end: date) -> list[tuple[str, int]]:
    """[(YYYY-MM-DD, views)] for one video, oldest first."""
    r = _get(
        _url(ANALYTICS, ids="channel==MINE", metrics="views", dimensions="day", sort="day",
             filters=f"video=={video_id}", startDate=start.isoformat(), endDate=end.isoformat()),
        token,
    )  # fmt: skip
    return [(row[0], int(row[1])) for row in r.get("rows") or []]


def video_stats(token: str, video_ids: list[str]) -> dict[str, dict]:
    """{video_id: {views, likes, comments}} from the Data API (real time, no reporting lag)."""
    r = _get(_url(f"{DATA}/videos", part="statistics", id=",".join(video_ids)), token)
    out = {}
    for i in r.get("items") or []:
        s = i.get("statistics") or {}
        out[i["id"]] = {
            "views": int(s.get("viewCount", 0)),
            "likes": int(s["likeCount"]) if "likeCount" in s else None,  # hidden likes: absent
            "comments": int(s["commentCount"]) if "commentCount" in s else None,
        }
    return out


def avg_view_pct(token: str, video_id: str, start: date, end: date) -> float | None:
    """Lifetime averageViewPercentage (Analytics; lags 2-3 days, so None early on)."""
    r = _get(
        _url(ANALYTICS, ids="channel==MINE", metrics="averageViewPercentage",
             filters=f"video=={video_id}", startDate=start.isoformat(), endDate=end.isoformat()),
        token,
    )  # fmt: skip
    rows = r.get("rows") or []
    return float(rows[0][0]) if rows and rows[0] and rows[0][0] is not None else None


# --- fake transport (recorded responses) ------------------------------------------------------


def _fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def _factor(video_id: str) -> float:
    """Deterministic per-video scale (0.3-3.0) so fake videos differ but runs repeat."""
    return 0.3 + int(hashlib.sha256(video_id.encode()).hexdigest()[:6], 16) % 271 / 100


def fake_response(url: str) -> dict:
    u = urllib.parse.urlparse(url)
    q = dict(urllib.parse.parse_qsl(u.query))
    if u.path.endswith("/channels"):
        return _fixture("channels_list.json")
    if u.path.endswith("/playlistItems"):
        return _fixture("playlist_items.json")
    vid = q.get("filters", "video==").split("==", 1)[1] or q.get("id", "")
    if u.path.endswith("/videos"):
        body = _fixture("videos_statistics.json")
        template = body["items"][0]
        items = []
        for v in vid.split(","):
            k = _factor(v)
            s = {key: str(round(int(val) * k)) for key, val in template["statistics"].items()}
            items.append({**template, "id": v, "statistics": s})
        return {
            **body,
            "items": items,
            "pageInfo": {"totalResults": len(items), "resultsPerPage": len(items)},
        }
    if q.get("metrics") == "averageViewPercentage":
        return _fixture("analytics_avg_view_pct.json")
    body = _fixture("analytics_daily_views.json")
    k, start = _factor(vid), date.fromisoformat(q["startDate"])
    end = date.fromisoformat(q["endDate"])
    rows = [
        [(start + timedelta(days=i)).isoformat(), round(views * k)]
        for i, (_, views) in enumerate(body["rows"])
        if start + timedelta(days=i) <= end
    ]
    return {**body, "rows": rows}
