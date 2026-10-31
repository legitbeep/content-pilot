---
name: add-pipeline-step
description: Add or reorder a worker pipeline step in apps/worker/pipeline.
---
# Add a pipeline step

1. Read `docs/pipeline.md` and `docs/queue.md`.
2. Create `apps/worker/pipeline/<step>.py`:
   ```python
   # Docs: docs/pipeline.md
   """<one line: what it does, input → output>."""


   def run(job: dict) -> None:
       ...
   ```
3. Make it **idempotent**: check for existing output first; upsert rows; deterministic R2 keys.
4. To pause for the user: `raise NeedsInput(request, resume_from="<next step>")`.
5. Insert the module into `STEPS` in `pipeline/__init__.py` at the right position. Stop is
   checked by `run()` between steps automatically.
6. Extend `tests/test_pipeline.py` expected order; add a test for the step's own logic.
7. Update `docs/pipeline.md` (steps table) and `docs/queue.md` if transitions change.
8. Update affected docs + run `pnpm check` and `pnpm test`.
