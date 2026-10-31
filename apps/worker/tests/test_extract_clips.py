import subprocess

import pytest

import ranking
from pipeline import extract_clips as ex
from pipeline import text
from pipeline.extract_clips import Candidate, Extraction, Scores
from worker.timeline import Timeline
from worker.transcript import Transcript, Utterance, Word


def make_transcript(n: int = 120) -> Transcript:
    """n one-second words; a sentence ends every 5 words."""
    words = [
        Word(w=f"w{i}." if i % 5 == 4 else f"w{i}", start=i, end=i + 0.8, speaker=None)
        for i in range(n)
    ]
    return Transcript(
        provider="groq",
        duration_s=n,
        words=words,
        utterances=[Utterance(start=0, end=n, text="")],
    )


def cand(s: int, e: int, score: float = 0.8, **kw) -> Candidate:
    return Candidate(
        start_sentence=s,
        end_sentence=e,
        hook=kw.get("hook", "Nobody tells you this"),
        topic=kw.get("topic", "Hygiene"),
        hook_type=kw.get("hook_type", "tip"),
        reasons=kw.get("reasons", ["Matches your core topic: hygiene", "Strong hook"]),
        scores=Scores(hook_strength=score, standalone=score, brand_fit=score, request_match=1),
        description="d",
    )


def test_windows_overlap_and_cover_everything():
    sents = [text.Sentence(i, i * 10, i * 10 + 9, "x") for i in range(70)]  # 700s
    ws = ex.windows(sents)
    assert [(w[0].start, w[-1].start) for w in ws] == [(0, 290), (270, 560), (540, 690)]


def test_snap_to_sentences_and_length():
    sents = text.sentences(make_transcript())  # sentences of 5s: [0,4.8], [5,9.8], ...
    c = ex.snap(cand(2, 2), sents)  # 4.8s → extended to >= 15s (14.8 is not enough)
    assert c and (c["start_s"], c["end_s"]) == (10, 29.8)
    c = ex.snap(cand(0, 20), sents)  # 105s → shrunk to <= 60s
    assert c and c["end_s"] - c["start_s"] <= 60 and c["start_s"] == 0
    assert ex.snap(cand(5, 999), sents) is None


@pytest.mark.parametrize(
    ("length", "bucket"), [(30, "short"), (31, "medium"), (60, "medium"), (61, "long")]
)
def test_features(length, bucket):
    assert ex.features(" Hygiene ", length, "tip") == {
        "topic": "hygiene",
        "length_bucket": bucket,
        "hook_type": "tip",
    }


def test_merge_keeps_better_of_overlapping():
    a = {"start_s": 0, "end_s": 30, "scores": {"x": 0.9}}
    b = {"start_s": 5, "end_s": 35, "scores": {"x": 0.5}}  # overlaps a by 25 of 30
    c = {"start_s": 25, "end_s": 55, "scores": {"x": 0.4}}  # overlaps a by 5
    assert ex.merge([b, c, a]) == [a, c]


def test_wanted():
    assert ex.wanted(None) == 8
    assert ex.wanted("give me 12 clips about pricing") == 12
    assert ex.wanted("50 short clips") == 15


def test_ranking_stub_mean_desc():
    out = ranking.apply_weights("u", [{"scores": {"a": 0.2, "b": 0.4}}, {"scores": {"a": 1}}])
    assert [c["ranking_score"] for c in out] == [1, 0.3]


def test_timeline_is_valid_v2():
    t = Timeline.model_validate(ex.timeline("clips/x/source.mp4", 5, 20.5))
    assert t.version == 2 and t.segments[0].end == 20.5


def test_word_slice_rebased_with_handles():
    words = make_transcript(30).words
    out = ex.word_slice(words, 5, 12)
    assert out[0] == {"w": "w5", "start": 0, "end": 0.8} and out[-1]["w"] == "w11"


class FakeConn:
    def __init__(self, log):
        self.log = log

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self.log.append((sql, params))
        return self

    def fetchone(self):
        return {"id": self.log[-1][1]["id"]}

    def fetchall(self):
        return [{"file_key": "clips/old/source.mp4", "thumb_key": None}]


def test_run_cuts_uploads_and_writes_rows(monkeypatch, tmp_path):
    src = str(tmp_path / "src.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=30",
         "-f", "lavfi", "-i", "sine=frequency=440", "-t", "120", "-c:v", "libx264",
         "-preset", "ultrafast", "-c:a", "aac", "-shortest", src],
        check=True,
    )  # fmt: skip
    sql: list = []
    uploads: list = []
    deleted: list = []
    prompts: list = []
    monkeypatch.setattr(text, "load", lambda job: make_transcript())
    monkeypatch.setattr(ex.r2, "presigned_get", lambda key: src)
    monkeypatch.setattr(ex.r2, "upload_file", lambda p, k, ct: uploads.append(k))
    monkeypatch.setattr(ex.r2, "delete", deleted.append)
    monkeypatch.setattr(ex.db, "connect", lambda: FakeConn(sql))

    def gen(**kw):
        prompts.append(kw["prompt"])
        return {"data": Extraction(clips=[cand(0, 3, 0.6), cand(10, 13, 0.9, hook_type="story")])}

    monkeypatch.setattr(ex, "generate_json", gen)
    job = {
        "id": "00000000-0000-0000-0000-000000000001",
        "user_id": "u1",
        "source_key": "uploads/u1/x/v.mp4",
        "media": {"duration_s": 120},
        "memory_snapshot": "Brand: Clean Hands\nCore topics: hygiene",
        "user_intent": "Critique or contrast it",
        "request": None,
    }
    ex.run(job)

    assert "Creator's intent for this video: Critique or contrast it" in prompts[0]
    assert "Core topics: hygiene" in prompts[0]
    assert deleted == ["clips/old/source.mp4"]
    inserts = [p for s, p in sql if s.strip().startswith("insert into clips")]
    assert [p["start_s"] for p in inserts] == [50, 0]  # best ranked first; one per window overlap
    first = inserts[0]
    assert (first["fs"], first["fe"]) == (45, 74.8)
    assert first["features"].obj == {
        "topic": "hygiene",
        "length_bucket": "short",
        "hook_type": "story",
    }
    assert first["reasons"].obj[0] == "Matches your core topic: hygiene"
    assert first["words"].obj[0]["start"] == 0  # word w45 at t=45 → 0 in the file
    assert (
        len(uploads) == 4
        and uploads[0].endswith("/source.mp4")
        and uploads[1].endswith("/thumb.jpg")
    )
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src],
        capture_output=True, text=True,
    )  # fmt: skip
    assert float(out.stdout) > 0
