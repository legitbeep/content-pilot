# Docs: docs/agent.md
"""Seed data for the editor agent + learning (plan 7), on top of the editor seed.

`pnpm seed:agent` / `pnpm seed:agent:clean`. Reuses seeds/editor.py (3 clips, timelines, voiceover +
music uploads) for the plan-7 dev user (SEED_EMAIL, default dev-agent@clip-studio.test), tagged
`jobs.note = 'seed:agent'`. Adds:
- the same manual edit (cut the first 2s) on clips one and two, plus a caption_edit event
  (plan 9's shape) and clip_feedback rows when that table exists (plan 5's),
- a stated rule "Keep the full intro of every clip." and a learned candidate that conflicts with it,
- a `performance` candidate with 3 evidence (plan 9's shape) so the review shows a ready rule.
Seeded rules carry `"seed": "seed:agent"` in their evidence; clean also removes `source = 'edits'`
rules of this user (the analyzer's output for seed edits). Idempotent.
"""

import os
import sys
import uuid

from psycopg.types.json import Jsonb

from seeds import editor
from worker import db

TAG = "seed:agent"
os.environ.setdefault("SEED_EMAIL", "dev-agent@clip-studio.test")
editor.TAG = TAG  # the editor seed tags and cleans its job with this

STATED = "Keep the full intro of every clip."
LEARNED = "Cut the first 2 seconds of every clip."
PERF = "Open with the payoff in the first 3 seconds."


def seed() -> None:
    editor.seed()
    uid = editor.user_id()
    job_id, clip_ids = editor.ids(uid)
    with db.connect() as c:
        for cid in clip_ids[:2]:
            c.execute(
                """insert into edit_events (user_id, clip_id, op, args, summary, source)
                   values (%s, %s, 'trim', %s, 'Trimmed segment 1 to 7.0s-15.0s', 'manual')""",
                (uid, cid, Jsonb({"segment": 0, "start": 7})),
            )
        c.execute(
            """insert into edit_events (user_id, clip_id, op, args, summary, source)
               values (%s, %s, 'caption_edit', %s, 'Edited the YouTube caption', 'manual')""",
            (
                uid,
                clip_ids[0],
                Jsonb({"platform": "youtube", "before": "Seed clip", "after": "Watch this first"}),
            ),
        )
        has_feedback = c.execute("select to_regclass('public.clip_feedback') as t").fetchone()
        if has_feedback and has_feedback["t"]:
            c.execute("delete from clip_feedback where job_id = %s and user_id = %s", (job_id, uid))
            c.execute(
                """insert into clip_feedback (user_id, clip_id, job_id, decision, reason)
                   values (%s, %s, %s, 'rejected', 'slow start, too much intro')""",
                (uid, clip_ids[2], job_id),
            )
        c.execute("delete from learn_cursor where user_id = %s", (uid,))
        clean_rules(c, uid)
        seed_ev = {"seed": TAG}
        stated_id = str(uuid.uuid5(editor.NS, f"{uid}:agent:stated"))
        c.execute(
            """insert into brand_rules (id, user_id, source, status, rule, scope, evidence)
               values (%s, %s, 'manual', 'active', %s, 'editing', %s)""",
            (stated_id, uid, STATED, Jsonb([seed_ev])),
        )
        edits = [
            {"kind": "edit", "clip_id": cid, "op": "trim", "summary": "cut 2s", **seed_ev}
            for cid in clip_ids[:2]
        ]
        c.execute(
            """insert into brand_rules (user_id, source, status, rule, scope, evidence,
                                        evidence_count, conflicts_with)
               values (%s, 'edits', 'candidate', %s, 'editing', %s, 2, %s)""",
            (uid, LEARNED, Jsonb(edits), stated_id),
        )
        perf = [
            {"kind": "performance", "post_id": f"seed-{i}", "feature": "hook:payoff",
             "verdict": "high", **seed_ev}
            for i in range(3)
        ]  # fmt: skip
        c.execute(
            """insert into brand_rules (user_id, source, status, rule, scope, evidence,
                                        evidence_count)
               values (%s, 'performance', 'candidate', %s, 'clip_selection', %s, 3)""",
            (uid, PERF, Jsonb(perf)),
        )
    print(f"agent seed ready; open /editor/{clip_ids[0]} and /brand?tab=learned")


def clean_rules(c, uid: str) -> None:  # noqa: ANN001
    c.execute(
        """delete from brand_rules where user_id = %s
           and (evidence @> %s or source = 'edits')""",
        (uid, Jsonb([{"seed": TAG}])),
    )


def clean() -> None:
    uid = editor.user_id()
    with db.connect() as c:
        clean_rules(c, uid)
        c.execute("delete from learn_cursor where user_id = %s", (uid,))
    editor.clean()  # job (cascades clips, timelines, edit_events, clip_feedback) + R2 objects


if __name__ == "__main__":
    clean() if "--clean" in sys.argv else seed()
