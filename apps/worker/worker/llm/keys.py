# Docs: docs/llm.md
"""Which key pays for an AI call. Order: the user's own stored key -> the shared demo key, only
for allowlisted verified emails (DEMO_ALLOWED_EMAILS) -> missing_key. ADR 0008. Mirror of
apps/web/src/lib/server/llm/keys.ts; both run fixtures/key-resolution.json.
Server keys never leave this module: not logged, stored or shown."""

import os
from dataclasses import dataclass, field

from worker import db, keys

from .errors import AIError
from .registry import LLM_PROVIDERS, TRANSCRIPTION_PROVIDERS

DEMO_LLM = "gemini"  # demo defaults: Gemini for LLM, Groq for transcription
DEMO_TRANSCRIPTION = "groq"
DEMO_ENV = {"gemini": "GEMINI_API_KEY", "groq": "GROQ_API_KEY"}


@dataclass
class UserAI:
    usable: list[str]  # providers with a saved, not-rejected key
    settings: dict = field(
        default_factory=dict
    )  # llm_provider, transcription_provider, task_overrides
    demo: bool = False  # allowlisted verified email


def is_demo_user(email: str | None, confirmed: object) -> bool:
    allowed = {
        e.strip().lower() for e in os.environ.get("DEMO_ALLOWED_EMAILS", "").split(",") if e.strip()
    }
    return bool(email and confirmed and email.lower() in allowed)


def load_user_ai(user_id: str) -> UserAI:
    """Email comes from auth.users by user_id (server side), never from a client."""
    with db.connect() as c:
        rows = c.execute(
            "select provider::text as provider, invalid_at from user_keys where user_id = %s",
            (user_id,),
        ).fetchall()
        settings = c.execute(
            "select llm_provider::text as llm_provider, "
            "transcription_provider::text as transcription_provider, task_overrides "
            "from ai_settings where user_id = %s",
            (user_id,),
        ).fetchone()
        user = (
            c.execute(
                "select email, email_confirmed_at from auth.users where id = %s", (user_id,)
            ).fetchone()
            if os.environ.get("DEMO_ALLOWED_EMAILS")
            else None
        )
    return UserAI(
        usable=[r["provider"] for r in rows if not r["invalid_at"]],
        settings=dict(settings or {}),
        demo=bool(user and is_demo_user(user["email"], user["email_confirmed_at"])),
    )


def _first_usable(ai: UserAI, allowed: list[str], order: list) -> str | None:
    return next((p for p in [*order, *allowed] if p in allowed and p in ai.usable), None)


def resolve_llm(ai: UserAI, task: str) -> dict | None:
    """Task override -> default provider -> first usable LLM key -> demo (Gemini) -> None."""
    s = ai.settings
    own = _first_usable(
        ai, LLM_PROVIDERS, [(s.get("task_overrides") or {}).get(task), s.get("llm_provider")]
    )
    if own:
        return {"provider": own, "source": "user"}
    return {"provider": DEMO_LLM, "source": "demo"} if ai.demo else None


def resolve_transcription(ai: UserAI) -> dict | None:
    """Chosen provider -> deepgram -> groq -> demo (Groq) -> None."""
    own = _first_usable(ai, TRANSCRIPTION_PROVIDERS, [ai.settings.get("transcription_provider")])
    if own:
        return {"provider": own, "source": "user"}
    return {"provider": DEMO_TRANSCRIPTION, "source": "demo"} if ai.demo else None


def key_for(user_id: str, r: dict) -> str:
    if r["source"] == "demo":
        key = os.environ.get(DEMO_ENV[r["provider"]])
        if not key:
            raise AIError("missing_key")
        return key
    try:
        return keys.get_key(user_id, r["provider"])
    except keys.MissingKey as e:  # removed between resolve and read
        raise AIError("missing_key") from e
