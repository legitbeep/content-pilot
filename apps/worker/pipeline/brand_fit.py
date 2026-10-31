# Docs: docs/pipeline.md
"""Soft check against brand memory (`jobs.memory_snapshot`, frozen when the job was created).
LLM task `brand_fit` summarises the video and compares it with the brand. On conflict:
NeedsInput(question, "extract_clips"); the answer becomes `jobs.user_intent` (job-scoped, never a
brand rule) and the pipeline resumes at extract_clips."""

from pydantic import BaseModel

from worker.llm import generate_json, max_input_tokens

from . import text
from .errors import NeedsInput

OPTIONS = ["Critique or contrast it", "Proceed anyway", "Cancel"]


class Fit(BaseModel):
    summary: str
    topics: list[str]
    conflict: bool
    question: str | None = None


SYSTEM = """You check whether a creator's long video fits their brand before clips are cut from it.
You get the brand memory, the creator's request (may be empty) and the transcript (lines "[index] mm:ss text"; speakers are not labelled).
- summary: 1-2 sentences on what the video is about. topics: 1-5 short topics.
- conflict: true only if the video's main subject clearly goes against the brand (an off-limits topic, or the opposite of a core value, e.g. cooking chicken for a vegan brand). Different but compatible topics are not a conflict. If the request already explains the angle, there is no conflict.
- question (only when conflict): one plain sentence naming the clash, ending "What do you want to do?", e.g. "This video is about cooking chicken, which conflicts with your vegan brand. What do you want to do?"
Return JSON: {"summary": "...", "topics": ["..."], "conflict": false, "question": null}"""  # noqa: E501


def run(job: dict) -> None:
    memory = (job.get("memory_snapshot") or "").strip()
    if not memory:
        return  # no brand memory to compare with
    sents = text.sentences(text.load(job))
    budget = text.budget(max_input_tokens(job["user_id"], "brand_fit"), 2000 + text.tokens(memory))
    # ponytail: only the first chunk (≈ the whole video for any provider at the 60-min cap).
    transcript = (text.chunk([text.line(s) for s in sents], budget) or [""])[0]
    fit: Fit = generate_json(
        user_id=job["user_id"],
        task="brand_fit",
        schema=Fit,
        system=SYSTEM,
        prompt=f"Brand memory:\n{memory}\n\nRequest: {job.get('request') or '(none)'}\n\n"
        f"Transcript:\n{transcript}",
    )["data"]
    if fit.conflict:
        raise NeedsInput(
            {
                "kind": "brand_fit",
                "question": fit.question
                or f"This video is about {', '.join(fit.topics) or 'a topic'}, which may not fit "
                "your brand. What do you want to do?",
                "options": OPTIONS,
                "allow_text": True,
                "summary": fit.summary,
                "topics": fit.topics,
            },
            "extract_clips",
        )
