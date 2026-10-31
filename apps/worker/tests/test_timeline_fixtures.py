import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from worker.timeline import Timeline

FIXTURES = Path(__file__).parents[3] / "packages/timeline-schema/fixtures"


def _load(kind: str):
    return [
        pytest.param(json.loads(p.read_text()), id=p.name) for p in (FIXTURES / kind).glob("*.json")
    ]


@pytest.mark.parametrize("data", _load("valid"))
def test_valid(data):
    Timeline.model_validate(data)


@pytest.mark.parametrize("data", _load("invalid"))
def test_invalid(data):
    with pytest.raises(ValidationError):
        Timeline.model_validate(data)
