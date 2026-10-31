---
covers:
  - packages/llm-registry
  - apps/web/src/lib/server/llm
  - apps/worker/worker/llm
  - apps/worker/worker/transcription
  - apps/web/src/lib/entities/api-key
  - fixtures/key-resolution.json
  - scripts/check-ai-imports.ts
last_updated: 2026-10-31
---
# LLM + transcription adapters

Every AI feature calls ONE interface. Never import a provider SDK or call a provider API
anywhere else; `pnpm check:ai` (`scripts/check-ai-imports.ts`, part of `pnpm check`) fails on
SDK imports, provider API hosts outside the adapter folders, and server AI key env vars.
All providers are plain HTTP (`fetch` / `urllib`), no SDKs.

## Interface (web and worker, same contract)
| | Web (`$lib/server/llm`) | Worker (`worker/llm`) |
|---|---|---|
| Text | `generateText({ userId, task, system, prompt })` | `generate_text(user_id=, task=, system=, prompt=)` |
| JSON | `generateJSON({ userId, task, schema, system, prompt })` (zod) | `generate_json(..., schema=<pydantic model>)` |
| Budget | `maxInputTokens(userId, task)` | `max_input_tokens(user_id, task)` |
| Errors | `AIError` (`kind`, `provider`, `retryAfter`, `detail`, `message`) | `AIError` (same fields, snake_case) |

Returns `{ data, provider, model, usage: { inputTokens, outputTokens }, latencyMs }`
(worker: `input_tokens`, `output_tokens`, `latency_ms`). `data` is the text, or the validated
zod value / pydantic model.

- **No native tool calling.** The editor agent and everything else use `generateJSON`, so
  behaviour is the same across providers.
- **JSON:** the JSON Schema (from `z.toJSONSchema` / `model_json_schema()`) is appended to the
  system prompt, plus the provider-native mode from the registry's `json_mode`: Gemini
  `responseMimeType: application/json` (`mime_type`), Groq `response_format: json_schema` with
  `strict: false` (`json_schema`), Claude instructions only (`instructions`). Native strict
  schemas reject common shapes, so we always validate ourselves: parse (code fences and leading
  prose tolerated) → zod/pydantic → on failure ONE repair call with the validation error → then
  `AIError('unknown')` "<Provider> returned an answer we couldn't read…".
- **Long input:** callers that send transcripts check `maxInputTokens` and chunk (extraction
  works in ~5-minute windows). Groq has the smallest window (~115k tokens; free tier also 8k TPM).

## Transcription (worker)
`transcribe(user_id, media_url) -> Transcript` in `worker/transcription` (our format,
`worker/transcript.py`, `docs/pipeline.md`). Provider: the user's `ai_settings.transcription_provider`
→ deepgram → groq → demo Groq (allowlisted only) → `AIError('missing_key')`. A 401/403 on the
user's own key marks it invalid; success marks it valid. No retries inside: the job's Retry re-runs.
- **Deepgram** (`deepgram.py`): `POST /v1/listen?model=nova-3&smart_format&diarize_model=latest&utterances`
  with `{"url": <presigned GET>}`; word timestamps + speaker labels. 402 → "out of credit".
- **Groq Whisper** (`groq.py`, `whisper-large-v3-turbo`): ffmpeg → mono 16 kHz 32 kbps mp3
  (~14 MB per hour) → chunks of ≤600s (and under 90% of the 25 MB upload limit) with 2s overlap →
  `POST /openai/v1/audio/transcriptions` multipart, `response_format=verbose_json`,
  `timestamp_granularities[]=word` + `segment` → offset each chunk's times → each overlap is split
  at its midpoint so no word is kept twice. **No speaker labels** (`speaker = null`).
  Needs ffmpeg (in the worker image).
- **Gemini is not used for transcription**: its word timestamps aren't reliable enough for cutting
  clips on word boundaries. Gemini is LLM-only.
- **Voice input hook (plan 7):** `aiCapabilities().voice` is true with a Wispr key, a Groq key, or
  demo. Plan 7 should use Wispr when saved, else Groq Whisper via a small web route that posts the
  recorded clip to the same Groq endpoint with the user's key (add it under `$lib/server/llm`,
  never in the browser).

## Tasks and tiers
Callers name a task, never a model. Unknown task → error; add new tasks to the registry and
list them in your handoff.

| Tier | Tasks |
|---|---|
| `smart` | extract_clips, brand_fit, plan_edits, learn_rules, stated_rules, recommendations |
| `fast` | moderate_text, understand_request, captions |

## Registry
`packages/llm-registry/registry.json` is the only place model ids live: tasks → tier, per
provider `name`, `json_mode`, and per tier `model`, `max_input_tokens`, `max_output_tokens`;
plus transcription models. Web imports it via `@clip-studio/llm-registry`. The worker's Docker
build only sees `apps/worker`, so `pnpm gen:llm-registry` copies it to
`apps/worker/worker/llm/registry.json`; `tests/test_llm.py` fails if the copies differ.

Checked 2026-10-31 (sources in `registry.json` → `sources`):
| Provider | smart | fast | Notes |
|---|---|---|---|
| Claude | `claude-opus-5-5` | `claude-haiku-5-5` | 1M context; Opus always thinks (counts against `max_tokens`); prefill not supported |
| Gemini | `gemini-4-argon` | `gemini-3.8-flash` | 1,048,576 input; thinking tokens counted as output |
| Groq | `openai/gpt-oss-120b` | `openai/gpt-oss-20b` | 131,072 context incl. output |

## Which key is used (ADR 0008)
BYOK only, with one demo exception. Same logic in `$lib/server/llm/keys.ts` and
`worker/llm/keys.py`; both run `fixtures/key-resolution.json`.
1. **The user's own key.** A key counts unless a provider rejected it (`user_keys.invalid_at`;
   unverified keys count). LLM: task override → default provider → first usable of
   anthropic, gemini, groq. Transcription: chosen provider → deepgram → groq.
2. **Demo keys**, only if (1) found nothing AND the user's **verified** email is in
   `DEMO_ALLOWED_EMAILS`: `GEMINI_API_KEY` for LLM, `GROQ_API_KEY` for transcription. The email is
   read server side only: web from the verified session (`locals.user`, `isDemoUser`) or the admin
   API by user id; worker from `auth.users` by user id. Never from the client.
   Cap: `DEMO_DAILY_JOB_LIMIT` (default 10) jobs per UTC day (`requireDemoJobQuota`, 429).
3. Otherwise `AIError('missing_key')`: **"Add an AI provider key in Settings to use this."**

Server keys never reach the browser, logs or Settings (not even last 4). `llm_calls.key_source`
records `user` or `demo`. A provider 401/403 on the user's own key sets `invalid_at`
(resolution then skips it); on a demo key it doesn't.

## Errors
| kind | When | Retried |
|---|---|---|
| `missing_key` | no usable key (see above) | no |
| `invalid_key` | 401/403, Gemini 400 "API key not valid" | no |
| `rate_limited` | 429; `retryAfter` from `retry-after` or Gemini `RetryInfo` | 2x |
| `overloaded` | 498/502/503/504/529 | 2x |
| `context_too_long` | 413 or "prompt is too long" / `context_length_exceeded` / … | no |
| `content_blocked` | Claude `stop_reason: refusal`, Gemini block/SAFETY, Groq `content_filter` | no |
| `unknown` | anything else, network errors, unreadable JSON after repair | no |

Retries wait `retryAfter` seconds or 1s, 2s; a `retryAfter` over 20s fails fast instead.
Messages (same text in both languages, checked by the fixtures), e.g. "Your Groq key hit its rate
limit. Try again in 30s or switch provider in Settings." The worker shows `message` as `jobs.error`
and keeps the provider response in `jobs.error_detail`.

## Call log
`llm_calls` (user_id, provider, key_source, model, task, input/output tokens, latency_ms, ok,
error_kind, created_at): one row per `generate*` call (repair and retries summed), written with
the secret key / `DATABASE_URL`; RLS lets owners read their own rows. A failed insert never fails
the call.

## Gating AI actions (every plan uses these)
- **Server:** every route that starts AI work calls
  `await requireAIKeys(userId, 'llm' | 'transcription' | 'both')` from `$lib/server/llm`. It
  throws `error(409, MISSING_KEY_MESSAGE)` and returns `{ demo }`; routes that create jobs also
  call `requireDemoJobQuota(userId)` when `demo`. `formAction` shows thrown error messages as-is.
- **Client:** `aiCapabilities(keys, demo)` in `$lib/entities/api-key` → `{ llm, transcription,
  voice, demo }`. The shell layout puts it in `page.data.ai`. Wrap every AI button in
  `<RequiresAI need="llm">{#snippet children({ disabled })}<Button {disabled}>…</Button>{/snippet}</RequiresAI>`:
  while the capability is missing the button is disabled, with a tooltip (the missing_key message)
  and an "Add a key in Settings" link. `need` can be an array (`['llm', 'transcription']`).
- `demo: true` means the shared demo keys cover everything: all capabilities are on and
  onboarding's key step (plan 4) counts as complete.
- Use it for: agent chat and voice (plan 7, `llm` / `voice`), regenerate rules (plan 4, `llm`),
  clip extraction re-runs (plan 5), generate captions (plan 8, `llm`), recommendations (plan 9, `llm`).

## Tests
- `packages/llm-registry/fixtures/responses.json`: provider HTTP responses → expected text/usage
  or error kind/retry-after/message. Run by `apps/web/src/lib/server/llm/llm.test.ts` and
  `apps/worker/tests/test_llm.py`, so the twins can't drift.
- `fixtures/key-resolution.json`: own key / demo / missing_key cases, both languages.
- Both suites also prove: a non-allowlisted user gets `missing_key` even with every server AI env
  var set; an allowlisted user gets the demo key; an allowlisted user with a key uses their own;
  JSON repair; retries; a rejected key gets marked invalid.
