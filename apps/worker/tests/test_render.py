import json
import shutil
import subprocess
from pathlib import Path

import pytest

from loops import render as render_loop
from worker.render import SIZES, RenderError, build_ass, build_command, has_filter, render
from worker.timeline import Timeline

FIXTURES = Path(__file__).parents[3] / "packages/timeline-schema/fixtures"
needs_ffmpeg = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not installed")


def load(name: str) -> Timeline:
    return Timeline.model_validate(json.loads((FIXTURES / "valid" / name).read_text()))


WORDS = [{"w": f"w{i}", "start": i * 0.5, "end": i * 0.5 + 0.4} for i in range(20)]


def test_ass_has_captions_overlays_and_style():
    t = load("full.json")
    ass = build_ass(t, {t.sourceKey: WORDS})
    assert ass is not None
    assert "PlayResX: 1080" in ass and "PlayResY: 1080" in ass
    assert "&H0042C8F5" in ass  # #F5C842 as ASS BGR
    assert "Caption-bottom" in ass and "Overlay-top,,0,0,0,,Pricing myth #1" in ass
    assert "Dialogue: 0,0:00:00.00,0:00:00.90,Caption-bottom,,0,0,0,,w2 w3" in ass


def test_ass_none_when_nothing_to_burn():
    assert build_ass(load("minimal.json"), {}) is None


def test_command_maps_timeline():
    t = load("full.json")
    cmd = build_command(t, lambda k: f"/in/{k}", lambda k: "clips/7c1d" not in k, "/x.ass", "o.mp4")
    graph = cmd[cmd.index("-filter_complex") + 1]
    assert cmd.count("-i") == 5  # 3 segments + voiceover + music
    assert cmd[cmd.index("-ss") : cmd.index("-ss") + 4] == ["-ss", "1.000", "-t", "3.000"]
    assert "concat=n=3:v=1:a=1" in graph
    assert "anullsrc" in graph  # merged source without audio
    assert "scale=1080:1080" in graph and "x='(iw-ow)*0.3'" in graph
    assert "boxblur" in graph and "enable='between(t,1.0,3.0)'" in graph
    assert "sidechaincompress" in graph and "adelay=1000:all=1" in graph
    assert "subtitles=filename='/x.ass'" in graph
    assert cmd[cmd.index("-t", cmd.index("-filter_complex")) + 1] == "7.500"


def test_muted_original_and_tracks():
    t = load("full.json").model_copy(deep=True)
    t.originalAudio.muted = True
    t.audio[1].muted = True
    graph = build_command(t, str, lambda k: True, None, "o.mp4")
    graph = graph[graph.index("-filter_complex") + 1]
    assert "[ac]volume=0[orig]" in graph and "sidechaincompress" not in graph


def _probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",  # noqa: E501
         "-of", "json", path],
        capture_output=True, text=True, check=True,
    ).stdout  # fmt: skip
    return json.loads(out)


def _make_sources(t: Timeline, tmp: Path) -> dict[str, str]:
    files: dict[str, str] = {}
    for i, key in enumerate(sorted({t.segment_key(s) for s in t.segments})):
        p = tmp / f"v{i}.mp4"
        size = "360x640" if i % 2 == 0 else "640x360"
        audio = [] if i == 1 else ["-f", "lavfi", "-i", f"sine=frequency={300 + 100 * i}"]
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
             f"testsrc2=size={size}:rate=30", *audio, "-t", "9", "-c:v", "libx264",
             "-preset", "ultrafast", "-c:a", "aac", str(p)],
            check=True,
        )  # fmt: skip
        files[key] = str(p)
    for i, a in enumerate(t.audio):
        p = tmp / f"a{i}.m4a"
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
             f"sine=frequency={500 + 200 * i}", "-t", "4", "-c:a", "aac", str(p)],
            check=True,
        )  # fmt: skip
        files[a.key] = str(p)
    return files


@needs_ffmpeg
@pytest.mark.parametrize("name", [p.name for p in (FIXTURES / "valid").glob("*.json")])
def test_golden_render(name, tmp_path):
    t = load(name)
    if not has_filter("subtitles"):  # e.g. Homebrew ffmpeg without libass; Docker has it
        t = t.model_copy(update={"textOverlays": []}, deep=True)
        t.captions.enabled = False
    files = _make_sources(t, tmp_path)
    out = str(tmp_path / "out.mp4")
    render(t, files.__getitem__, {t.sourceKey: WORDS}, out)
    info = _probe(out)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert (video["width"], video["height"]) == SIZES[t.aspect]
    assert any(s["codec_type"] == "audio" for s in info["streams"])
    assert abs(float(info["format"]["duration"]) - t.duration) < 0.15


def test_process_refuses_foreign_keys(monkeypatch):
    t = load("minimal.json")

    class Conn:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def execute(self, sql, params=None):
            self.sql = sql
            return self

        def fetchone(self):
            return {"data": t.model_dump(exclude_none=True), "revision": 3}

        def fetchall(self):
            return []  # the user owns no clip file with that key

    finished = []
    monkeypatch.setattr(render_loop.db, "connect", lambda: Conn())
    monkeypatch.setattr(render_loop, "_finish", lambda c, s, **kw: finished.append((s, kw)))
    result = render_loop.process({"id": "c1", "user_id": "u1"})
    assert result.startswith("failed: This clip uses a file")
    assert finished[0][0] == "failed"


def test_render_error_without_libass(monkeypatch, tmp_path):
    monkeypatch.setattr("worker.render.has_filter", lambda n: False)
    t = load("full.json")
    with pytest.raises(RenderError, match="libass"):
        render(t, str, {}, str(tmp_path / "o.mp4"))
