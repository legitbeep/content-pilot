# Docs: docs/publishing.md
"""YouTube Data API v3 over stdlib urllib: refresh an access token, resumable upload.
Endpoints checked 2026-10-31 (developers.google.com/youtube/v3)."""

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from worker.llm.errors import USER_AGENT

TOKEN_URL = "https://oauth2.googleapis.com/token"
UPLOAD_URL = (
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"
)


class ReconnectNeeded(Exception):
    """The refresh token was revoked or expired (invalid_grant). Retrying won't help."""


class YouTubeError(Exception):
    """Upload failed; `message` is user-readable, `retry` says whether a retry may help."""

    def __init__(self, message: str, detail: str = "", retry: bool = True):
        super().__init__(message)
        self.message, self.detail, self.retry = message, detail, retry


def _send(req: urllib.request.Request, timeout: int = 60):
    req.add_header("User-Agent", USER_AGENT)
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:2000]
        raise _http_error(e.code, body) from e


def _http_error(status: int, body: str) -> Exception:
    if "invalid_client" in body or "unauthorized_client" in body:
        return YouTubeError(
            "YouTube posting isn't set up on the server (OAuth client rejected).", body, False
        )
    if "invalid_grant" in body or status == 401:
        return ReconnectNeeded(body)
    if "quotaExceeded" in body or "uploadLimitExceeded" in body:
        return YouTubeError(
            "YouTube's daily upload limit was reached. Retry tomorrow.", body, retry=False
        )
    if "youtubeSignupRequired" in body:
        return YouTubeError(
            "This Google account has no YouTube channel. Create one, then retry.", body, False
        )
    if status in (400, 403):
        return YouTubeError(f"YouTube rejected the upload ({status}).", body, retry=False)
    return YouTubeError(f"YouTube upload failed ({status}).", body)


def access_token(refresh_token: str) -> str:
    data = urllib.parse.urlencode(
        {
            "client_id": os.environ["YOUTUBE_CLIENT_ID"],
            "client_secret": os.environ["YOUTUBE_CLIENT_SECRET"],
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
    ).encode()
    with _send(urllib.request.Request(TOKEN_URL, data=data, method="POST")) as r:
        return json.load(r)["access_token"]


def upload(token: str, path: str, title: str, description: str, tags: list[str]) -> str:
    """Resumable upload (init, then one PUT of the whole file). Returns the video id.
    Private while the Google app is unverified."""
    size = os.path.getsize(path)
    meta = {
        "snippet": {"title": title, "description": description, "tags": tags},
        "status": {"privacyStatus": "private", "selfDeclaredMadeForKids": False},
    }
    init = urllib.request.Request(
        UPLOAD_URL,
        data=json.dumps(meta).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/mp4",
            "X-Upload-Content-Length": str(size),
        },
    )
    with _send(init) as r:
        location = r.headers["Location"]
    # ponytail: whole file in one PUT (clips are small); chunk + resume on 308 if uploads get big.
    with open(path, "rb") as f:
        put = urllib.request.Request(
            location,
            data=f.read(),
            method="PUT",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "video/mp4"},
        )
    with _send(put, timeout=600) as r:
        return json.load(r)["id"]
