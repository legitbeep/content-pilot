# Docs: docs/llm.md
"""Typed view of registry.json, a copy of packages/llm-registry/registry.json made by
`pnpm gen:llm-registry` (the Docker build only sees apps/worker). tests/test_llm.py fails if the
copies differ. Model ids live only there."""

import json
from pathlib import Path
from typing import Literal

REGISTRY = json.loads((Path(__file__).parent / "registry.json").read_text())

LLM_PROVIDERS = ["anthropic", "gemini", "groq"]
TRANSCRIPTION_PROVIDERS = ["deepgram", "groq"]
TASKS = list(REGISTRY["tasks"])
Tier = Literal["smart", "fast"]


def tier_of(task: str) -> Tier:
    if task not in REGISTRY["tasks"]:
        raise ValueError(
            f"unknown LLM task {task!r}; add it to packages/llm-registry/registry.json"
        )
    return REGISTRY["tasks"][task]


def model_for(provider: str, task: str) -> dict:
    """{model, max_input_tokens, max_output_tokens}"""
    return REGISTRY["llm"][provider]["tiers"][tier_of(task)]


def provider_name(provider: str) -> str:
    entry = REGISTRY["llm"].get(provider) or REGISTRY["transcription"].get(provider) or {}
    return entry.get("name", provider)
