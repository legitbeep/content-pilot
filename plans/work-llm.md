# Work plan: LLM + transcription adapters (plan-llm + user additions)

Branch `feat/llm-adapter`, port 5173. User additions win: BYOK only (no env AI keys at all),
`missing_key` error kind, `requireAIKeys` guard, client capability helper, worker missing_key test.

## Decisions
- Raw HTTP (fetch / urllib) for every provider, no SDKs. Remove `@anthropic-ai/sdk`,
  `anthropic` deps and the server-wide `claude()` helpers (unused today). ADR 0008 supersedes 0007.
- Registry: `packages/llm-registry/registry.json` (source). Web imports it via the workspace
  package; the worker's Docker context is `apps/worker`, so `pnpm gen:llm-registry` copies it to
  `apps/worker/worker/llm/registry.json` and a pytest fails if the copies differ.
- Shared fixtures `packages/llm-registry/fixtures/*.json`: provider HTTP responses → expected
  text/usage/error kind/message. Both vitest and pytest run them.
- Key usable = row exists and `invalid_at` is null (unverified counts). Resolution:
  task override → default provider → first usable LLM key (anthropic, gemini, groq).
  Transcription: chosen provider → deepgram → groq.
- Prefs in a new table `ai_settings` (user_id pk, llm_provider, transcription_provider,
  task_overrides jsonb). Call log `llm_calls`. `key_provider` gets `gemini`.
- Errors: missing_key, invalid_key, rate_limited, overloaded, context_too_long, content_blocked,
  unknown. Same message templates in both languages (fixture-checked). 2 retries with backoff
  for rate_limited/overloaded; JSON validation failure → 1 repair retry → `unknown`.
- `pnpm check:ai` (scripts/check-ai-imports.ts): fails on provider SDK imports anywhere, provider
  API hosts outside the adapter folders, and AI key env var names in app code.

## Phase 1 — LLM adapter
1. packages/llm-registry (registry.json, src/index.ts, fixtures), gen script + equality test.
2. Web `$lib/server/llm/`: providers.ts (request/parse/classify), core.ts (resolve, retry,
   JSON validate+repair, log; deps injected), keys.ts (load decrypted keys + settings),
   index.ts (generateText, generateJSON, maxInputTokens, LLMError, requireAIKeys).
3. Worker `worker/llm/`: same shape in Python (pydantic).
4. Migration `*_llm_adapter.sql`: enum value, llm_calls, ai_settings, RLS. Apply with psql.
5. Tests: fixtures in both languages, JSON repair retry, retries, missing_key with env vars set.
6. Remove claude.ts/claude.py + SDK deps; ADR 0008; docs/llm.md; env docs/.env.example cleanup.

## Phase 2 — Transcription (worker)
1. `worker/transcription/`: `transcribe(user_id, media_url) -> Transcript`; deepgram.py (moved),
   groq.py (ffmpeg mono 16k → chunks under the size limit with 2s overlap → verbose_json words →
   offset + dedupe). `Word.speaker` becomes optional.
2. pipeline/transcribe.py uses it; LLMError(missing_key) → StepError with the exact message.
3. Tests: stitching fixture, missing_key job fails cleanly then retry works.

## Phase 3 — Keys, settings, guards, UI
1. Providers: anthropic, gemini, groq, deepgram, wispr with validators (in llm folder).
2. `requireAIKeys(userId, needs)` → 409 `{message}`; presign action uses it ('transcription';
   also 'llm' since a job runs LLM steps → 'both').
3. Client helper `$lib/entities/api-key` `aiCapabilities(keys)` → {llm, transcription, voice};
   `<NeedsKey>`-style wrapper disables the upload with tooltip + "Add a key in Settings".
4. Settings → AI providers: keys, default LLM + transcription pickers, Advanced per-task
   overrides, 7-day usage from llm_calls. "Only have one key? A Groq key covers everything."
5. `pnpm llm:smoke` (manual). Voice fallback to Groq Whisper: documented hook only.

## Phase 4 — handoff
plans/handoff-llm.md with Needs human steps.
