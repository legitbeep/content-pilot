import json
from pathlib import Path

from worker.transcript import Transcript, from_deepgram

RAW = json.loads((Path(__file__).parent / "fixtures" / "deepgram_small.json").read_text())


def test_normalises_deepgram():
    t = from_deepgram(RAW)
    assert t.provider == "deepgram" and t.duration_s == 4.2
    assert [w.w for w in t.words] == ["Hello", "there.", "Hi,", "how", "are", "you?"]
    assert t.words[2].speaker == 1 and t.words[2].start == 1.5
    assert [(u.speaker, u.text) for u in t.utterances] == [
        (0, "Hello there."),
        (1, "Hi, how are you?"),
    ]
    Transcript.model_validate(t.model_dump())  # round-trips through our own schema


def test_builds_utterances_from_words_when_missing():
    raw = {**RAW, "results": {**RAW["results"], "utterances": None}}
    t = from_deepgram(raw)
    assert [(u.speaker, u.text, u.start, u.end) for u in t.utterances] == [
        (0, "Hello there.", 0.08, 0.8),
        (1, "Hi, how are you?", 1.5, 2.3),
    ]


def test_empty_response():
    t = from_deepgram({"results": {"channels": [{"alternatives": [{"words": []}]}]}})
    assert t.words == [] and t.utterances == [] and t.duration_s == 0
