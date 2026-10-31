---
covers:
  - apps/worker/main.py
  - supabase/migrations
last_updated: 2026-10-31
---
# Queue

Postgres `jobs` table, no Redis. Claimed by the worker loop in `apps/worker/main.py`.

## States
```
pending ──claim──▶ processing ──▶ done
   ▲  │                │  ├──▶ failed ──retry──▶ pending (resume_from_step = failed step)
   │  └─cancel─▶ stopped◀─┤ (stop_requested seen between steps)
   │                      └──▶ needs_input ──user answers──▶ pending (resume_from_step = extract_clips)
```
| From | To | Who | How |
|---|---|---|---|
| pending | processing | worker | claim query below |
| pending | stopped | web | user cancels; set directly |
| processing | done / failed | worker | after last step / on exception (`error` set) |
| processing | stopped | worker | `stop_requested = true` seen before next step (`pipeline.Stopped`) |
| processing | needs_input | worker | step raises `pipeline.NeedsInput`; sets `input_request`, `resume_from_step`; slot released |
| needs_input | pending | web | user answers; store answer, clear `input_request` |
| failed / stopped | pending | web | retry; `resume_from_step` = `current_step` (or null to restart) |

## Claiming
```sql
update jobs set status = 'processing', claimed_at = now(), attempts = attempts + 1,
       stop_requested = false, updated_at = now()
where id = (select id from jobs where status = 'pending'
            order by position, created_at
            for update skip locked limit 1)
returning *;
```
Safe with multiple workers. Poll every 5 s (`POLL_SECONDS`).

## Ordering
Only `pending` jobs are reorderable: web rewrites `position` for the user's pending jobs.

## Stop
Web sets `stop_requested = true`. `pipeline.run` calls `should_stop()` before every step, so a
step in progress finishes first (steps are idempotent, so a later retry is safe).

## Not built yet
Claim query, status writes, crash recovery (`processing` with stale `claimed_at` → `pending`,
resume from `current_step`). See TODOs in `apps/worker/main.py`.
