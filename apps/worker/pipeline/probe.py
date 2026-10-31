# Docs: docs/pipeline.md
"""ffprobe the source over a presigned GET URL → jobs.media {duration_s, width, height, has_audio}.
Fails clearly when there is no audio track or the video is longer than 60 minutes."""

import json
import subprocess

from worker import db, r2

from .errors import StepError

MAX_SECONDS = 60 * 60


def parse(probe: dict) -> dict:
    streams = probe.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), {})
    duration = float(probe.get("format", {}).get("duration") or video.get("duration") or 0)
    return {
        "duration_s": duration,
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
        "has_audio": any(s.get("codec_type") == "audio" for s in streams),
    }


def check(media: dict) -> None:
    if not media["has_audio"]:
        raise StepError("This video has no audio track, so there's nothing to transcribe.")
    if not media["width"]:
        raise StepError("We couldn't find a video stream in this file.")
    if media["duration_s"] > MAX_SECONDS:
        raise StepError("Videos must be 60 minutes or shorter.")


def run(job: dict) -> None:
    url = r2.presigned_get(job["source_key"])
    try:
        out = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                url,
            ],
            capture_output=True,
            text=True,
            timeout=120,
            check=True,
        )
    except subprocess.CalledProcessError as e:
        raise StepError("We couldn't read this video file. It may be corrupt.", e.stderr) from e
    media = parse(json.loads(out.stdout))
    check(media)
    db.update_job(job["id"], media=db.Jsonb(media), duration_s=media["duration_s"])
    job["media"] = media
