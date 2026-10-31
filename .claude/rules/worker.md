---
paths:
  - "apps/worker/**"
---
# Worker rules

- **Pipeline steps are idempotent**: re-running after a crash or retry leaves the same result
  (upserts, deterministic R2 keys, check-before-write, "already deleted" = success).
- **Stop is checked between steps**: `pipeline.run` calls `should_stop()` before each step. Keep
  steps short enough that a stop takes effect promptly; split a long step rather than polling inside it.
- To pause for the user, raise `NeedsInput(request, resume_from=<next step>)`.
- Every DB query is scoped by `user_id` (the worker's connection bypasses RLS).
- Each `pipeline/*.py` starts with `# Docs: docs/pipeline.md`.
