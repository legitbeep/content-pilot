# apps/worker

Python 3.12 worker (uv). One loop: claim queue jobs, run the pipeline; later also render
timelines, publish scheduled posts, collect metric checkpoints. Read `docs/queue.md` and
`docs/pipeline.md` first.

## Layout
- `main.py` — loop + job claiming (`docs/queue.md`).
- `pipeline/` — one module per step, ordered in `pipeline/__init__.py` `STEPS` (`docs/pipeline.md`).
- `worker/timeline.py` — pydantic timeline mirror (`docs/timeline.md`).
- `tests/` — pytest; timeline fixtures come from `packages/timeline-schema/fixtures/`.

## Commands (from repo root)
`pnpm worker` (Docker), `pnpm check:worker` (ruff + pyright), `uv run --directory apps/worker pytest`.
Add deps with `uv add --directory apps/worker <pkg>`.

## Notes
- Uses `DATABASE_URL` (bypasses RLS): scope every query by `user_id`.
- FFmpeg exists only in the Docker image; run render code via `pnpm worker`.
