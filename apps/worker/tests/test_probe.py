import pytest

from pipeline import StepError
from pipeline.probe import check, parse

PROBE = {
    "format": {"duration": "312.48"},
    "streams": [
        {"codec_type": "video", "width": 1920, "height": 1080},
        {"codec_type": "audio"},
    ],
}


def test_parse():
    assert parse(PROBE) == {"duration_s": 312.48, "width": 1920, "height": 1080, "has_audio": True}


def test_no_audio_fails_clearly():
    media = parse({**PROBE, "streams": PROBE["streams"][:1]})
    with pytest.raises(StepError, match="no audio track"):
        check(media)


def test_too_long():
    with pytest.raises(StepError, match="60 minutes"):
        check(parse({**PROBE, "format": {"duration": "3700"}}))
