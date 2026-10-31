import pytest

from pipeline import NeedsInput, StepError, brand_fit, nsfw_check, text
from pipeline.brand_fit import Fit
from pipeline.nsfw_check import Flag, Moderation, decide, flagged_ranges
from worker.transcript import Transcript, Utterance, Word


def transcript() -> Transcript:
    ws = "Hello there. Today we cook chicken? Yes we do".split()
    words = [Word(w=w, start=i, end=i + 0.8, speaker=None) for i, w in enumerate(ws)]
    return Transcript(
        provider="groq",
        duration_s=10,
        words=words,
        utterances=[Utterance(speaker=None, start=0, end=8.8, text=" ".join(ws))],
    )


def test_sentences_split_on_punctuation_and_handle_null_speaker():
    s = text.sentences(transcript())
    assert [x.text for x in s] == ["Hello there.", "Today we cook chicken?", "Yes we do"]
    assert (s[1].start, s[1].end) == (2, 5.8)
    assert text.line(s[1]) == "[1] 00:02.0 Today we cook chicken?"


def test_chunk_respects_budget_and_keeps_lines_whole():
    lines = ["x" * 40] * 10  # ~11 tokens each
    blocks = text.chunk(lines, 30)
    assert (
        all(len(b.split("\n")) <= 2 for b in blocks)
        and sum(len(b.split("\n")) for b in blocks) == 10
    )


@pytest.mark.parametrize(
    ("frames", "texts", "want"),
    [
        ([0.0] * 60, ["clean"], "pass"),
        ([0.0] * 60, [], "pass"),
        ([0.7] + [0.0] * 59, ["clean"], "borderline"),
        ([0.0] * 60, ["clean", "borderline"], "borderline"),
        ([0.95] * 2 + [0.0] * 58, ["clean"], "borderline"),  # 2 sure frames: not enough
        ([0.95] * 3 + [0.0] * 57, ["clean"], "explicit"),
        ([0.95] * 4 + [0.0] * 196, ["clean"], "borderline"),  # 4 of 200 < 5%
        ([0.0] * 60, ["explicit"], "explicit"),
    ],
)
def test_decide(frames, texts, want):
    assert decide(frames, texts) == want


def test_flagged_ranges_merge_close_seconds():
    scores = [0, 0.7, 0.8, 0, 0.65, 0, 0, 0, 0, 0.9]
    assert [(r["start"], r["end"]) for r in flagged_ranges(scores)] == [(1, 5), (9, 10)]
    assert flagged_ranges(scores)[0]["why"] == "Image check (80%)"


@pytest.fixture
def fake(monkeypatch):
    calls: dict = {"deleted": [], "updates": []}
    monkeypatch.setattr(text, "load", lambda job: transcript())
    monkeypatch.setattr(nsfw_check.r2, "presigned_get", lambda key: "url")
    monkeypatch.setattr(nsfw_check.r2, "delete", calls["deleted"].append)
    monkeypatch.setattr(nsfw_check.db, "update_job", lambda i, **f: calls["updates"].append(f))
    for mod in (nsfw_check, brand_fit):
        monkeypatch.setattr(mod, "max_input_tokens", lambda user_id, task: 100_000)
    return calls


def llm(monkeypatch, mod, data):
    seen = []

    def gen(**kw):
        seen.append(kw)
        return {"data": data}

    monkeypatch.setattr(mod, "generate_json", gen)
    return seen


JOB = {"id": "j1", "user_id": "u1", "source_key": "uploads/u1/x/v.mp4"}


def test_nsfw_explicit_fails_and_deletes_source(monkeypatch, fake):
    monkeypatch.setattr(nsfw_check, "frame_scores", lambda url: [0.99] * 10)
    llm(monkeypatch, nsfw_check, Moderation(verdict="clean"))
    with pytest.raises(StepError) as e:
        nsfw_check.run(dict(JOB))
    assert e.value.message == "This video contains explicit content and can't be processed."
    assert fake["deleted"] == [JOB["source_key"]] and "source_deleted_at" in fake["updates"][0]


def test_nsfw_borderline_asks_with_flagged_times(monkeypatch, fake):
    monkeypatch.setattr(nsfw_check, "frame_scores", lambda url: [0.0] * 10)
    llm(
        monkeypatch,
        nsfw_check,
        Moderation(verdict="borderline", flags=[Flag(sentence=1, why="x")]),
    )
    with pytest.raises(NeedsInput) as e:
        nsfw_check.run(dict(JOB))
    assert e.value.resume_from == "brand_fit"
    assert e.value.request["options"] == ["Continue", "Cancel"]
    assert e.value.request["flagged"] == [{"start": 2, "end": 5.8, "why": "x"}]
    assert fake["deleted"] == []


def test_nsfw_clean_passes(monkeypatch, fake):
    monkeypatch.setattr(nsfw_check, "frame_scores", lambda url: [0.1] * 10)
    llm(monkeypatch, nsfw_check, Moderation(verdict="clean", flags=[Flag(sentence=99, why="x")]))
    nsfw_check.run(dict(JOB))


def test_brand_fit_conflict_asks(monkeypatch, fake):
    q = "This video is about cooking chicken, which conflicts with your vegan brand. What now?"
    seen = llm(
        monkeypatch, brand_fit, Fit(summary="s", topics=["chicken"], conflict=True, question=q)
    )
    with pytest.raises(NeedsInput) as e:
        brand_fit.run({**JOB, "memory_snapshot": "Brand: Green Plate\n- Never promote meat."})
    assert e.value.resume_from == "extract_clips"
    assert e.value.request["question"] == q and e.value.request["allow_text"]
    assert "Critique or contrast it" in e.value.request["options"]
    assert "Never promote meat" in seen[0]["prompt"] and seen[0]["task"] == "brand_fit"


def test_brand_fit_passes_without_conflict_or_memory(monkeypatch, fake):
    seen = llm(monkeypatch, brand_fit, Fit(summary="s", topics=["x"], conflict=False))
    brand_fit.run({**JOB, "memory_snapshot": "Brand: X"})
    brand_fit.run({**JOB, "memory_snapshot": None})
    assert len(seen) == 1
