# Docs: docs/timeline.md
"""Timeline -> FFmpeg. `build_ass` and `build_command` are pure (unit-tested); `render` probes the
inputs, writes the ASS file and runs ffmpeg. Inputs are any URL/path ffmpeg can read."""

import functools
import json
import subprocess
from collections.abc import Callable
from pathlib import Path

from worker.timeline import Timeline, caption_chunks

SIZES = {"9:16": (1080, 1920), "1:1": (1080, 1080), "16:9": (1920, 1080)}
RATIOS = {"9:16": "9/16", "1:1": "1", "16:9": "16/9"}
FONT_SCALE = {"small": 0.045, "medium": 0.06, "large": 0.075}
ALIGN = {"bottom": 2, "center": 5, "top": 8}
FPS = 30
AFMT = "aformat=sample_rates=48000:channel_layouts=stereo"
EVENT_FMT = "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"


class RenderError(Exception):
    """A failure the user can act on; the message is shown as-is."""


@functools.cache
def has_filter(name: str) -> bool:
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True
    ).stdout
    return any(line.split()[1:2] == [name] for line in out.splitlines())


def has_audio(src: str) -> bool:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
         "-of", "json", src],
        capture_output=True, text=True, timeout=60,
    )  # fmt: skip
    if out.returncode:
        raise RenderError("A file used by this clip can't be read. Remove it and try again.")
    return bool(json.loads(out.stdout or "{}").get("streams"))


def _ts(s: float) -> str:
    cs = round(max(0.0, s) * 100)
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def _ass_text(text: str) -> str:
    return text.replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", "\\N")


def _ass_color(hex_rgb: str) -> str:
    r, g, b = hex_rgb[1:3], hex_rgb[3:5], hex_rgb[5:7]
    return f"&H00{b}{g}{r}".upper()


def build_ass(t: Timeline, words_by_key: dict[str, list[dict]]) -> str | None:
    """Captions + text overlays as one ASS script on the output frame, or None if there are none."""
    chunks = caption_chunks(t, words_by_key) if t.captions.enabled else []
    if not chunks and not t.textOverlays:
        return None
    w, h = SIZES[t.aspect]
    st = t.captions.style
    size = round(h * FONT_SCALE[st.size])
    margin = round(h * 0.12)
    fields = "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle"
    fmt = (
        f"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        f"BackColour, {fields}, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
    )
    styles = []
    for p, a in ALIGN.items():
        mv = 0 if p == "center" else margin
        styles.append(
            f"Style: Caption-{p},{st.font},{size},{_ass_color(st.color)},&H00FFFFFF,&H00000000,"
            f"&H80000000,-1,0,0,0,100,100,0,0,1,{max(2, size // 12)},0,{a},60,60,{mv},1"
        )
        styles.append(
            f"Style: Overlay-{p},{st.font},{round(h * 0.05)},&H00FFFFFF,&H00FFFFFF,&H00000000,"
            f"&H80000000,-1,0,0,0,100,100,0,0,1,3,0,{a},60,60,{round(h * 0.08) if mv else 0},1"
        )
    events = [
        f"Dialogue: 0,{_ts(c['start'])},{_ts(c['end'])},Caption-{st.position},,0,0,0,,"
        f"{_ass_text(c['text'])}"
        for c in chunks
    ] + [
        f"Dialogue: 1,{_ts(o.start)},{_ts(o.end)},Overlay-{o.position},,0,0,0,,{_ass_text(o.text)}"
        for o in t.textOverlays
    ]
    return "\n".join(
        ["[Script Info]", "ScriptType: v4.00+", f"PlayResX: {w}", f"PlayResY: {h}",
         "WrapStyle: 0", "ScaledBorderAndShadow: yes", "", "[V4+ Styles]", fmt, *styles, "",
         "[Events]", EVENT_FMT,
         *events, ""]
    )  # fmt: skip


def _even(n: float) -> int:
    return max(2, int(n) // 2 * 2)


def _mix(labels: list[str], out: str, duration: str) -> str:
    if len(labels) == 1:
        return f"{labels[0]}anull{out}"
    return f"{''.join(labels)}amix=inputs={len(labels)}:duration={duration}:normalize=0{out}"


def build_command(
    t: Timeline,
    src: Callable[[str], str],
    audio_in: Callable[[str], bool],
    ass_path: str | None,
    out: str,
) -> list[str]:
    """ffmpeg argv. `src(key)` gives an input URL/path; `audio_in(key)` whether it has audio."""
    w, h = SIZES[t.aspect]
    r = RATIOS[t.aspect]
    total = t.duration
    args = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    graph: list[str] = []
    pairs = ""
    for i, seg in enumerate(t.segments):
        key, length = t.segment_key(seg), seg.end - seg.start
        args += ["-ss", f"{seg.start:.3f}", "-t", f"{length:.3f}", "-i", src(key)]
        graph.append(
            f"[{i}:v]crop=w='min(iw,ih*{r})':h='min(ih,iw/({r}))':x='(iw-ow)*{t.cropX}'"
            f":y='(ih-oh)/2',scale={w}:{h},setsar=1,fps={FPS},format=yuv420p,"
            f"trim=duration={length:.3f},setpts=PTS-STARTPTS[v{i}]"
        )
        audio = f"[{i}:a]{AFMT}," if audio_in(key) else f"anullsrc=r=48000:cl=stereo,{AFMT},"
        graph.append(f"{audio}apad,atrim=duration={length:.3f},asetpts=PTS-STARTPTS[a{i}]")
        pairs += f"[v{i}][a{i}]"
    n = len(t.segments)
    graph.append(f"{pairs}concat=n={n}:v=1:a=1[vc][ac]")

    v = "[vc]"
    for j, b in enumerate(t.blurRegions):
        bw, bh, bx, by = _even(b.w * w), _even(b.h * h), _even(b.x * w), _even(b.y * h)
        radius = max(1, min(20, min(bw, bh) // 4))
        graph.append(
            f"{v}split[base{j}][src{j}];[src{j}]crop={bw}:{bh}:{bx}:{by},"
            f"boxblur={radius}:1[blur{j}];[base{j}][blur{j}]overlay={bx}:{by}"
            f":enable='between(t,{b.start},{b.end})'[vb{j}]"
        )
        v = f"[vb{j}]"
    if ass_path:
        graph.append(f"{v}subtitles=filename='{ass_path}'[vout]")
    else:
        graph.append(f"{v}null[vout]")

    orig = 0 if t.originalAudio.muted else t.originalAudio.volume
    graph.append(f"[ac]volume={orig}[orig]")
    voice, music = ["[orig]"], []
    for k, tr in enumerate(a for a in t.audio if not a.muted):
        idx = n + k
        args += ["-i", src(tr.key)]
        ms = round(tr.start * 1000)
        graph.append(f"[{idx}:a]{AFMT},volume={tr.volume},adelay={ms}:all=1[t{k}]")
        (music if tr.kind == "music" else voice).append(f"[t{k}]")
    graph.append(_mix(voice, "[voice]", "first"))
    if not music:
        graph.append("[voice]anull[aout]")
    else:
        graph.append(_mix(music, "[music]", "longest"))
        if t.ducking:
            graph.append(
                "[voice]asplit=2[vmix][vkey];[music][vkey]sidechaincompress="
                "threshold=0.02:ratio=8:attack=20:release=400[mduck];"
                "[vmix][mduck]amix=inputs=2:duration=first:normalize=0[aout]"
            )
        else:
            graph.append("[voice][music]amix=inputs=2:duration=first:normalize=0[aout]")

    return [
        *args, "-filter_complex", ";".join(graph), "-map", "[vout]", "-map", "[aout]",
        "-t", f"{total:.3f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out,
    ]  # fmt: skip


def render(
    t: Timeline, src: Callable[[str], str], words_by_key: dict[str, list[dict]], out: str
) -> None:
    """Render `t` to `out` (mp4). Raises RenderError with a user-readable message."""
    ass = build_ass(t, words_by_key)
    if ass and not has_filter("subtitles"):
        raise RenderError("This worker's FFmpeg can't burn in captions or text (needs libass).")
    ass_path = None
    if ass:
        ass_path = str(Path(out).with_suffix(".ass"))
        Path(ass_path).write_text(ass)
    audio = {k: has_audio(src(k)) for k in {t.segment_key(s) for s in t.segments}}
    cmd = build_command(t, src, audio.__getitem__, ass_path, out)
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if res.returncode:
        raise RenderError(f"FFmpeg failed: {res.stderr.strip()[-500:] or 'unknown error'}")
