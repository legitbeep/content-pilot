# Docs: docs/auth-and-keys.md
"""Read a user's BYOK key (decrypted) and record what the provider said about it."""

from . import db
from .crypto import decrypt


class MissingKey(Exception):
    pass


def get_key(user_id: str, provider: str) -> str:
    with db.connect() as c:
        row = c.execute(
            "select ciphertext, iv from user_keys where user_id = %s and provider = %s",
            (user_id, provider),
        ).fetchone()
    if not row:
        raise MissingKey(provider)
    return decrypt(row["ciphertext"], row["iv"])


def _mark(user_id: str, provider: str, sql: str) -> None:
    with db.connect() as c:
        c.execute(
            f"update user_keys set {sql} where user_id = %s and provider = %s",  # type: ignore[arg-type]
            (user_id, provider),
        )


def mark_valid(user_id: str, provider: str) -> None:
    _mark(user_id, provider, "validated_at = coalesce(validated_at, now()), invalid_at = null")


def mark_invalid(user_id: str, provider: str) -> None:
    _mark(user_id, provider, "invalid_at = now()")
