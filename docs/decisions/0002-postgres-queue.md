---
covers:
  - apps/worker/main.py
last_updated: 2026-10-31
---
# 0002 — Postgres table as the job queue

**Status:** accepted

**Context.** Need a durable queue with ordering, stop, retry and user-visible state. Already have
Postgres (Supabase); no appetite for running Redis.

**Decision.** `jobs` table, claimed with `FOR UPDATE SKIP LOCKED`, polled every 5 s.
Queue state *is* the UI state (RLS lets users read their jobs directly).

**Consequences.** Zero extra infra; transactional with other writes. Polling latency (≤5 s) and
limited throughput — fine for a hackathon. Upgrade path: `LISTEN/NOTIFY` to cut latency.
