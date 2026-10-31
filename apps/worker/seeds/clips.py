# Docs: docs/pipeline.md
"""Seed data for plan 5 (safety, brand fit, extraction, Clip Picker). No real AI keys needed.

`pnpm seed:clips`        create/reset 3 jobs for SEED_EMAIL (default dev-clips@clip-studio.test):
                           A "Seed: hand washing" (on-brand) and B "Seed: chicken" (conflicts with
                           the vegan brand) are pending with generated videos + transcripts in R2;
                           C "Seed: borderline" is needs_input with an nsfw question.
`pnpm seed:clips:run`    run the real pipeline on A and B (probe, nsfw image model, steps, ffmpeg
                           cuts, R2, DB) with a FAKE LLM: A ends done (open the Clip Picker),
                           B asks the brand_fit question. Answer it in the Queue, then run again:
                           B ends done with reasons that echo your answer.
`pnpm seed:clips:clean`  delete exactly these jobs (cascade: clips, timelines, clip_feedback) and
                           their R2 objects.
Ids are uuid5 of the user, so re-running resets the same rows.

Shared DB caveat: another worker (e.g. main's Docker worker) claims ANY pending job. The seed
therefore also creates 2 placeholder `processing` jobs ("Seed: worker slot") so the per-user
limit of 2 keeps other workers off this user's jobs; `--run` claims A/B directly by id.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from psycopg.types.json import Jsonb

from worker import db, r2

TAG = "seed:clips"
NS = uuid.UUID("5eed0000-0000-4000-8000-00000000c115")
MEMORY = """Brand: Green Hands - plant-based kitchen hygiene
Niche: vegan home cooking
Content language: English
Audience: home cooks who just went vegan
Core topics: hygiene, vegan meal prep, kitchen safety
Never cover: meat, fish
Tone (0-100): casual→formal 30, funny→serious 50, bold→humble 50
Brand rules:
- Only promote plant-based food.
- Lead with a practical tip in the first sentence."""

HYGIENE = [
    "Here is the one hand washing mistake almost everyone makes in the kitchen.",
    "You rinse for five seconds and think you are done.",
    "Soap needs twenty seconds of scrubbing to break down grease and germs.",
    "Sing happy birthday twice if you need a timer.",
    "Do not forget the backs of your hands and under your nails.",
    "Why does this matter so much for vegan cooking?",
    "Raw vegetables are often eaten without heat to kill bacteria.",
    "So clean hands are your main line of defense.",
    "My favourite trick is keeping a nail brush right by the sink.",
    "It costs two dollars and lasts for years.",
    "Next, let us talk about cutting boards.",
    "Wooden boards are fine if you oil them and let them dry upright.",
    "Plastic boards should go in the dishwasher once a week.",
    "Never cut bread on the same board you used for onions without washing it.",
    "Here is a question I get all the time.",
    "Is vinegar enough to clean a counter?",
    "Honestly it helps with smell but it is not a disinfectant.",
    "Use dish soap and hot water first, then dry with a clean towel.",
    "Swap your sponge every week, it is the dirtiest thing in your kitchen.",
    "Microwaving a wet sponge for one minute kills most of the bacteria.",
    "Let me tell you what happened when I skipped this for a month.",
    "My whole family got a stomach bug from a salad I made.",
    "That was the day I started taking kitchen hygiene seriously.",
    "If you remember one thing, wash your hands for twenty seconds.",
    "Follow for more plant-based kitchen tips.",
]
CHICKEN = [
    "Today we are cooking the juiciest roast chicken you have ever had.",
    "Start by patting the chicken completely dry with paper towels.",
    "Dry skin is the secret to a crispy finish.",
    "Rub butter and garlic under the skin of the breast.",
    "Season generously with salt the night before if you can.",
    "Preheat your oven to two hundred and twenty degrees.",
    "Here is the contrarian take, do not baste the chicken.",
    "Opening the oven drops the temperature and makes the skin soggy.",
    "Roast it for about an hour depending on the size.",
    "Check the thickest part of the thigh with a thermometer.",
    "You want seventy four degrees for safe chicken.",
    "Let it rest for fifteen minutes before carving.",
    "Resting keeps the juices inside the meat.",
    "Carve the legs off first, then slice the breast.",
    "Save the bones to make stock tomorrow.",
    "That is my weeknight roast chicken.",
    "Tell me in the comments how yours turned out.",
]
# (label, title, lavfi video, tone, sentences)
JOBS = [
    ("a", "Seed: hand washing", "testsrc2=size=1080x1920:rate=30", 440, HYGIENE),
    ("b", "Seed: chicken", "smptebars=size=1920x1080:rate=30", 330, CHICKEN),
]
WORD_S, GAP_S = 0.4, 0.4


def user_id() -> str:
    email = os.environ.get("SEED_EMAIL", "dev-clips@clip-studio.test")
    with db.connect() as c:
        row = c.execute("select id from auth.users where email = %s", (email,)).fetchone()
    if not row:
        sys.exit(f"No user {email}. Sign in once via /auth/dev-login (or set SEED_EMAIL).")
    return str(row["id"])


def job_id(uid: str, label: str) -> str:
    return str(uuid.uuid5(NS, f"{uid}:{label}"))


LABELS = ("a", "b", "c", "slot1", "slot2")


def all_ids(uid: str) -> list[str]:
    return [job_id(uid, x) for x in LABELS]


def transcript(sentences: list[str]) -> dict:
    words, utts, t = [], [], 1.0
    for s in sentences:
        start = t
        for w in s.split():
            words.append({"w": w, "start": round(t, 2), "end": round(t + WORD_S - 0.05, 2)})
            t += WORD_S
        utts.append({"speaker": None, "start": round(start, 2), "end": words[-1]["end"], "text": s})
        t += GAP_S
    return {"provider": "groq", "duration_s": round(t + 1, 2), "words": words, "utterances": utts}


def seed() -> None:
    uid = user_id()
    with tempfile.TemporaryDirectory() as tmp, db.connect() as c:
        for slot in ("slot1", "slot2"):  # first, so other workers never see A/B as claimable
            c.execute(
                """insert into jobs (id, user_id, status, source_key, title, note, position)
                   values (%s, %s, 'processing', 'none', 'Seed: worker slot', %s, 0)
                   on conflict (id) do update set status = 'processing'""",
                (job_id(uid, slot), uid, TAG),
            )
        for i, (label, title, video, hz, sentences) in enumerate(JOBS):
            jid = job_id(uid, label)
            tr = transcript(sentences)
            src = f"uploads/{uid}/seed-clips/{label}.mp4"
            out = str(Path(tmp) / f"{label}.mp4")
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", video,
                 "-f", "lavfi", "-i", f"sine=frequency={hz}", "-t", str(tr["duration_s"]),
                 "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-shortest", out],
                check=True,
            )  # fmt: skip
            r2.upload_file(out, src, "video/mp4")
            r2.put_json(f"transcripts/{jid}.json", tr)
            reset_job(c, uid, jid, title, src, i)
        cid = job_id(uid, "c")
        c.execute(
            """insert into jobs (id, user_id, status, source_key, title, note, position,
                                 input_request, resume_from_step, current_step)
               values (%s, %s, 'needs_input', %s, 'Seed: borderline', %s, 100, %s, 'brand_fit',
                       'nsfw_check')
               on conflict (id) do update set status = 'needs_input',
                 input_request = excluded.input_request, note = excluded.note""",
            (cid, uid, f"uploads/{uid}/seed-clips/c.mp4", TAG, Jsonb(NSFW_REQUEST)),
        )
    print(f"seeded jobs {all_ids(uid)}; next: pnpm seed:clips:run")


NSFW_REQUEST = {
    "kind": "nsfw",
    "question": "Parts of this video may not be safe for every platform. "
    "Do you want to continue making clips?",
    "options": ["Continue", "Cancel"],
    "allow_text": False,
    "flagged": [
        {"start": 42, "end": 47, "why": "Image check (72%)"},
        {"start": 95.2, "end": 99.1, "why": "Strong profanity"},
    ],
}


def reset_job(c, uid: str, jid: str, title: str, src: str, pos: int) -> None:
    for r in c.execute(
        "select file_key, thumb_key from clips where job_id = %s and user_id = %s", (jid, uid)
    ).fetchall():
        for key in (r["file_key"], r["thumb_key"]):
            if key:
                r2.delete(key)
    c.execute("delete from clips where job_id = %s and user_id = %s", (jid, uid))
    c.execute(
        """insert into jobs (id, user_id, status, source_key, title, note, position,
                             transcript_path, memory_snapshot)
           values (%(id)s, %(uid)s, 'pending', %(src)s, %(title)s, %(tag)s, %(pos)s,
                   %(tr)s, %(mem)s)
           on conflict (id) do update set status = 'pending', source_key = excluded.source_key,
             note = excluded.note, transcript_path = excluded.transcript_path,
             memory_snapshot = excluded.memory_snapshot, user_intent = null,
             input_request = null, resume_from_step = null, current_step = null, steps = '[]',
             progress = 0, error = null, error_detail = null, finished_at = null,
             proceeded_at = null, source_deleted_at = null, media = null""",
        {
            "id": jid, "uid": uid, "src": src, "title": title, "tag": TAG, "pos": pos + 1,
            "tr": f"transcripts/{jid}.json", "mem": MEMORY,
        },
    )  # fmt: skip


# --- fake LLM (no keys, no tokens) -------------------------------------------------------------


def fake_generate_json(*, user_id, task, schema, system, prompt):
    if task == "moderate_text":
        data = {"verdict": "clean", "flags": []}
    elif task == "brand_fit":
        chicken = "chicken" in prompt.lower()
        data = {
            "summary": "A roast chicken recipe." if chicken else "Kitchen hygiene tips.",
            "topics": ["roast chicken"] if chicken else ["hygiene"],
            "conflict": chicken,
            "question": "This video is about cooking chicken, which conflicts with your vegan "
            "brand. What do you want to do?"
            if chicken
            else None,
        }
    elif task == "extract_clips":
        data = {"clips": fake_clips(prompt)}
    else:
        raise ValueError(task)
    return {"data": schema.model_validate(data), "provider": "fake", "model": "fake"}


def fake_clips(prompt: str) -> list[dict]:
    idx = [int(m) for m in re.findall(r"^\[(\d+)\]", prompt, re.M)]
    intent = re.search(r"^Creator's intent for this video: (.+)$", prompt, re.M)
    hooks = re.findall(r"^\[\d+\] \S+ (.+)$", prompt, re.M)
    out = []
    for k in range(0, len(idx) - 3, 4):
        reasons = ["Matches your core topic: hygiene", "Opens with a practical tip"]
        if intent:
            reasons = [f"Fits your intent: {intent.group(1)}", "Clear standalone point"]
        s = 0.55 + (k * 7 % 40) / 100
        out.append(
            {
                "start_sentence": idx[k],
                "end_sentence": idx[k + 3],
                "hook": hooks[k],
                "topic": "hygiene" if not intent else "contrast",
                "hook_type": ["tip", "question", "story", "contrarian"][k // 4 % 4],
                "reasons": reasons,
                "scores": {
                    "hook_strength": s,
                    "standalone": 0.8,
                    "brand_fit": 0.9 if not intent else 0.6,
                    "request_match": 1,
                },
                "description": f"{hooks[k]} (fake LLM)",
            }
        )
    return out


def run() -> None:
    import main
    from pipeline import brand_fit, extract_clips, nsfw_check

    for mod in (nsfw_check, brand_fit, extract_clips):
        mod.generate_json = fake_generate_json  # type: ignore[attr-defined]
    for mod in (nsfw_check, brand_fit):
        mod.max_input_tokens = lambda user_id, task: 100_000  # type: ignore[attr-defined]
    if not nsfw_check.DEFAULT_MODEL.exists() and not os.environ.get("NSFW_MODEL_PATH"):
        print("NSFW model missing (pnpm nsfw:model); using zero frame scores")
        nsfw_check.frame_scores = lambda url: [0.0]  # type: ignore[assignment]
    uid = user_id()
    for label, *_ in JOBS:
        jid = job_id(uid, label)
        with db.connect() as c:  # claim by id without the per-user limit (slots hold it)
            job = c.execute(
                """update jobs set status = 'processing', claimed_at = now(),
                     attempts = attempts + 1, stop_requested = false, error = null,
                     error_detail = null, updated_at = now()
                   where id = %s and user_id = %s and status = 'pending' returning *""",
                (jid, uid),
            ).fetchone()
        print(f"job {jid} ({label}):", main.process(job) if job else "not pending, skipped")
        with db.connect() as c:
            row = c.execute(
                "select status, error, input_request from jobs where id = %s", (jid,)
            ).fetchone()
        print(json.dumps(row, default=str)[:400])


def clean() -> None:
    uid = user_id()
    ids = all_ids(uid)
    with db.connect() as c:
        rows = c.execute(
            "select file_key, thumb_key, render_path from clips where job_id = any(%s::uuid[]) "
            "and user_id = %s",
            (ids, uid),
        ).fetchall()
        for r in rows:
            for key in r.values():
                if key:
                    r2.delete(key)
        for label in LABELS:
            r2.delete(f"uploads/{uid}/seed-clips/{label}.mp4")
            r2.delete(f"transcripts/{job_id(uid, label)}.json")
        c.execute("delete from jobs where id = any(%s::uuid[]) and user_id = %s", (ids, uid))
    print(f"cleaned jobs {ids}")


if __name__ == "__main__":
    {"--clean": clean, "--run": run}.get(sys.argv[1] if len(sys.argv) > 1 else "", seed)()
