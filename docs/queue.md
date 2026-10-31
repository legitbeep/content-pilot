---
covers:
  - apps/worker/main.py
  - apps/worker/worker/db.py
  - apps/worker/worker/run_once.py
  - apps/web/src/lib/entities/job
  - apps/web/src/lib/features/upload-video
  - apps/web/src/lib/widgets/job-queue
  - apps/web/src/lib/server/r2.ts
  - apps/web/src/lib/shared/lib/form-action.ts
  - apps/web/src/routes/(authed)/(shell)/queue
  - supabase/migrations
last_updated: 2026-11-01
---
# Queue

Postgres `jobs` table, no Redis. Web (`routes/(authed)/(shell)/queue`) creates and edits jobs;
the worker loop in `apps/worker/main.py` claims and runs them.

## States
```
pending ──claim──▶ processing ──▶ done
   ▲  │                │  ├──▶ failed ──retry──▶ pending (resume_from_step = failed step)
   │  └─cancel─▶ stopped◀─┤ (stop_requested seen between steps)
   │                      └──▶ needs_input ──user answers──▶ pending (resume_from_step = extract_clips)
```
Allowed transitions and per-state actions are one pure, tested module:
`$lib/entities/job/transitions.ts` (`transitions`, `canTransition`, `actionsFor`, `can`). Every
queue form action loads the job and checks `can(status, action)` first, then writes with an
`.eq('status', <current>)` guard so a race with the worker becomes a no-op.

| From | To | Who | How |
|---|---|---|---|
| pending | processing | worker | claim query below |
| pending | stopped | web | (allowed, no UI yet: pending jobs are deleted instead) |
| processing | done / failed | worker | after last step (`finished_at`, `progress = 100`) / on exception (`error`, `error_detail`) |
| processing | stopped | worker | `stop_requested = true` seen before next step (`pipeline.Stopped`) |
| processing | needs_input | worker | step raises `pipeline.NeedsInput`; sets `input_request`, `resume_from_step`; slot released |
| needs_input | pending | web | **answer**: `input_request.answer` stored (a `brand_fit` answer also → `jobs.user_intent`), back to the end of the queue |
| failed / stopped | pending | web | **retry** / **re-queue**: `resume_from_step = current_step`, errors cleared, end of queue |

## Actions by state (Queue page)
| State | Actions |
|---|---|
| pending | drag to reorder, edit request (details sheet), delete |
| processing | stop |
| needs_input | open question (details sheet): one-click options from `input_request.options`, free text when `allow_text`, flagged time ranges (nsfw); "Cancel" deletes the job; delete |
| done | open clips (`/clips?job=<id>`, placeholder) |
| stopped | re-queue, delete |
| failed | retry, delete, error shown in the details sheet (user message + "Show details") |

Delete removes the row and, best effort, the R2 source and transcript objects.

## Upload (`$lib/features/upload-video`)
Video bytes never touch SvelteKit. Three steps, all from the browser:
1. **Client checks**: `video/*` only, ≤ 2 GB, ≤ 60 min (duration read from a `<video>` element's
   metadata; if the browser can't read it, the worker's probe enforces the limit). Limits:
   `UPLOAD_LIMITS` in `$lib/entities/job`.
2. **`?/presign`** form action: re-checks type/size, calls `requireAIKeys(user, 'both')` (LLM + transcription key, own
   or demo; 409 if missing) and, for demo users, `requireDemoJobQuota` (429 at the daily cap),
   returns `{ uploadId, key, url }` with key `uploads/<user_id>/<uploadId>/<safe name>` and a
   presigned R2 PUT URL (`$lib/server/r2.ts`, `aws4fetch`, 1 h).
3. Browser **PUTs** the file to R2 (XHR for the progress bar), then **`?/create`**: checks the key
   is under the user's prefix and the object exists (HEAD, size ≤ 2 GB), then inserts the job as
   `pending` at the end of the queue (`position = max + 1`) with `title`, `request`, `duration_s`
   and `memory_snapshot` (brand memory, scope clip_selection, `docs/pipeline.md`).
   It repeats the key/quota check first and, for demo users, `recordDemoJob` after the insert.
   Answer and retry also call `requireAIKeys` (they re-run AI steps). Thrown errors reach the UI
   through `formAction`, which surfaces `error(...)` messages as-is; the upload button is gated by
   `<RequiresAI>` (`docs/llm.md`).
   No job row exists until the upload succeeded.

Requires CORS on the R2 bucket allowing `PUT` from the web origin (`docs/env.md`).

## Queue page (`$lib/widgets/job-queue`)
Linear-style list (not cards). Row: drag handle (pending only), thumbnail placeholder, file name,
request snippet, step + progress bar while processing, duration (`Timecode`), `StatusBadge`,
created time, the state's main action. Pending jobs first in queue order, then the rest newest
first. Row click / Enter opens the **details sheet**: info, request (editable while pending),
question + answer (needs_input), error, step history (`jobs.steps`), and the transcript preview
(utterances with timecodes, and speaker labels when the provider gives them — Groq Whisper doesn't; from `GET /queue/<id>/transcript`).

Keyboard (in `$lib/shared/config/shortcuts.ts`, shown in the `?` sheet): `J`/`K` move the
selection, `Enter` opens details, `Backspace` deletes (with a confirm dialog).

**Live updates**: the page re-runs its load (`invalidate('app:jobs')`) every 3 s while any job is
pending or processing. Polling instead of Supabase Realtime: it works with the existing RLS without
adding `jobs` to the realtime publication; switch if it gets chatty.

## Claiming
At most **2 `processing` jobs per user**, enforced in the claim query:
```sql
update jobs set status = 'processing', claimed_at = now(), attempts = attempts + 1,
       stop_requested = false, error = null, error_detail = null, note = null, updated_at = now()
where id = (select j.id from jobs j
            where j.status = 'pending'
              and (select count(*) from jobs p
                   where p.user_id = j.user_id and p.status = 'processing') < 2
            order by j.position, j.created_at
            for update skip locked limit 1)
returning *;
```
Global worker concurrency = `WORKER_CONCURRENCY` threads (default 1), each running claim → run.
Poll every 5 s (`POLL_SECONDS`). With >1 thread, two claims can race past the per-user count by
one job; acceptable for now.

## Running a job (worker)
Per step: `current_step`, `progress` (step index / step count) and a `steps` entry
(`running` → `done`/`failed`/`stopped`) are written before and after. Then:
- all steps ok → `done`, `progress = 100`, `finished_at`, `note = "Clip extraction not built yet"`
  (while only probe + transcribe exist).
- `Stopped` → `stopped` (`current_step` = the step that would have run next).
- `NeedsInput` → `needs_input`, `input_request`, `resume_from_step`.
- `StepError(message)` → `failed`, `error = message` (user-readable, e.g. "Deepgram rejected the API
  key. Update it in Settings."), `error_detail` = technical detail.
- any other exception → `failed`, `error = "Something went wrong while <step>. Retry, or check
  the details."`, `error_detail` = traceback.

Retry re-runs from `current_step` (steps are idempotent).

## Run once (debugging)
`python -m worker.run_once <kind> <id>` (from `apps/worker`, or `pnpm worker:once job <id>` from the
root) processes one item and exits. Needs `DATABASE_URL` etc. in the environment
(e.g. `set -a; . ./.env; set +a`). Kind `job` claims that id with the loop's claim query
(`claim_job(job_id)`: still must be `pending` and under the per-user limit), runs `process`, prints
`job <id>: <status>`, and exits 1 if the job failed or could not be claimed, 2 on bad arguments.
Kind `render` claims that clip if `render_status = 'queued'` and renders it (`loops/render.py`,
`docs/timeline.md`). Kind `post` runs the publisher for one scheduled post (`docs/publishing.md`).
Later kinds (checkpoint) add one entry to `HANDLERS` in `worker/run_once.py`.
Like every worker module, it starts with `# Docs: docs/queue.md`.

## Stop
Web sets `stop_requested = true`. `pipeline.run` calls `should_stop()` before every step, so a
step in progress finishes first (steps are idempotent, so a later retry is safe).

## Not built yet
Crash recovery (`processing` with stale `claimed_at` → `pending`, resume from `current_step`).
