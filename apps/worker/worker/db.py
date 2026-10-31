# Docs: docs/queue.md
"""Postgres access for the worker (DATABASE_URL, postgres role: bypasses RLS, so always scope by
user_id). One short-lived autocommit connection per call keeps threads independent."""

import os
from typing import Any, cast

import psycopg
from psycopg.rows import DictRow, dict_row
from psycopg.types.json import Jsonb

__all__ = ["Jsonb", "connect", "update_job"]


def connect() -> psycopg.Connection[DictRow]:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set (apps/worker/.env)")
    # prepare_threshold=None: works through Supabase's transaction pooler too.
    conn = psycopg.connect(url, autocommit=True)
    conn.prepare_threshold = None
    conn.row_factory = dict_row  # type: ignore[assignment]
    return cast(psycopg.Connection[DictRow], conn)


def update_job(job_id: str, **fields: Any) -> None:
    cols = ", ".join(f"{k} = %({k})s" for k in fields)
    with connect() as c:
        c.execute(
            f"update jobs set {cols}, updated_at = now() where id = %(id)s",  # type: ignore[arg-type]
            {**fields, "id": job_id},
        )
