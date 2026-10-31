# packages/llm-registry

Model registry for the LLM + transcription adapters. `registry.json` is the source of truth:
tasks → tier, per provider the model id / max input tokens / JSON mode per tier. Read `docs/llm.md`.

- Web reads it through `src/index.ts`. The worker can't see this folder in Docker, so
  `pnpm gen:llm-registry` copies it to `apps/worker/worker/llm/registry.json`; a pytest fails
  if the copies differ. Edit here, then run the gen script.
- `fixtures/` = provider HTTP responses + expected results, run by BOTH vitest
  (`apps/web/src/lib/server/llm`) and pytest (`apps/worker/tests/test_llm.py`).
