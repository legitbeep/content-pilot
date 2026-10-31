# Plan LLM: Provider adapters (Claude, Gemini, Groq)

Wave 0 (runs on its own BEFORE Wave 1; everything after depends on it).
Branch `feat/llm-adapter`, dev port 5173.
Read plans/parallel-rules.md, CLAUDE.md, docs/INDEX.md, then only: auth-and-keys,
pipeline, env, data-model. Plan mode first. Commit after each phase.

## Why

Users bring their own key from Claude (Anthropic), Gemini (Google) or Groq. Every
AI feature (clip extraction, brand-fit, moderation text, captions, the editor
agent, memory learning, recommendations) must call ONE interface, never a
provider SDK directly. Transcription is speech-to-text, not an LLM call, so it gets
its own small adapter. Video rendering is FFmpeg and isn't affected.

## Phase 1: LLM adapter (web + worker, same contract)

1. Public interface, mirrored in TS (apps/web/src/lib/server/llm/) and Python
   (apps/worker/worker/llm/):
   - `generateText({ userId, task, system, prompt })`
   - `generateJSON({ userId, task, schema, system, prompt })`: provider-native JSON
     mode where available (Claude structured output or JSON instructions, Gemini
     response schema, Groq JSON mode), then ALWAYS validate with zod/pydantic, retry
     once with the validation error, then throw a readable error.
   - Returns `{ data, provider, model, usage: { inputTokens, outputTokens }, latencyMs }`.
2. No native tool calling. The editor agent and everything else use
   `generateJSON`, so behaviour is the same across providers.
3. **Task routing:** callers name a task, never a model. Tasks:
   `extract_clips`, `brand_fit`, `moderate_text`, `understand_request`, `plan_edits`,
   `captions`, `learn_rules`, `stated_rules`, `recommendations`.
   Each task maps to a tier: `smart` (extract_clips, brand_fit, plan_edits,
   learn_rules, stated_rules, recommendations) or `fast` (the rest).
4. **Model registry** (one file per language, generated from one shared JSON at
   packages/llm-registry/registry.json): for each provider, the model id for each
   tier, max input tokens, and JSON mode type. Verify current model ids and limits
   in each provider's docs; never hard-code model ids anywhere else.
5. **Provider choice:** the user picks a default LLM provider among the keys they've
   saved. Optional per-task override in Settings -> "Advanced". Resolution order:
   task override -> default provider -> first valid LLM key.
6. **Context limits:** the adapter exposes `maxInputTokens(userId, task)`. Callers
   that send long input (transcripts) must chunk to fit; extraction already works in
   ~5-minute windows.
7. **Normalised errors:** invalid_key, rate_limited (with retry-after), overloaded,
   context_too_long, content_blocked, unknown, each with a user-readable message
   ("Your Groq key hit its rate limit. Try again in 30s or switch provider in
   Settings."). Rate-limited and overloaded get 2 retries with backoff.
8. **Call log:** `llm_calls` table (user_id, provider, model, task, tokens, latency,
   ok, error_kind, created_at). RLS owner-only. Useful for debugging and for showing
   usage in Settings.
9. Tests: per-provider adapter tests with mocked HTTP responses (happy path, JSON
   repair retry, each error kind), shared fixtures used by BOTH TS and Python so the
   twins can't drift. A `pnpm llm:smoke` script runs one tiny real call per saved
   key (manual use only).

## Phase 2: Transcription adapter (worker)

1. Interface: `transcribe(userId, media_url) -> Transcript` in our normalised format
   (words with start/end/speaker?, utterances). Speaker labels are optional because
   not every provider returns them; downstream code must handle `speaker = null`.
2. Providers:
   - **Deepgram** (existing code, moved behind the interface): URL input, word
     timestamps, diarization.
   - **Groq Whisper**: extract mono 16 kHz audio with ffmpeg, split into chunks that
     fit Groq's current file size limit (verify it) with ~2s overlap, request
     word-level timestamps, offset each chunk's times, drop duplicate words in the
     overlaps. No speaker labels.
   - Gemini is not used for transcription (word timestamps aren't reliable enough
     for cutting clips). Document this decision in docs/llm.md.
3. The user picks a transcription provider among saved keys (Deepgram or Groq).
4. Fixture tests for chunk stitching (overlap dedupe, time offsets).

## Phase 3: Keys + settings + migration of existing code

1. Key providers become: anthropic, gemini, groq, deepgram, wispr. Each validated
   with a cheap authenticated call (e.g. list models; verify per provider).
2. Requirement to start jobs: at least one LLM key (anthropic | gemini | groq) AND
   one transcription key (deepgram | groq). A single Groq key covers both; say so in
   the UI ("Only have one key? A Groq key covers everything.").
3. Settings -> "AI providers": saved keys with status, default LLM provider picker,
   transcription provider picker, Advanced per-task overrides, and a small usage
   summary from llm_calls (calls and tokens per provider, last 7 days).
4. Update the Queue's missing-keys prompt and any onboarding key step to the new
   rule.
5. Replace every existing direct provider call (Prompt 3's Deepgram code, any
   Anthropic calls) with the adapters. Add a check to `pnpm check` that fails if a
   provider SDK is imported outside the adapter folders.
6. Optional, if simple: let the editor's voice input fall back to Groq Whisper when
   there's no Wispr key. Document the hook in docs/llm.md for plan 7.

## Docs

Create docs/llm.md (interface, tasks and tiers, registry, provider choice, errors,
transcription providers, the Gemini decision) and add it to INDEX.md. Update
auth-and-keys.md, env.md, pipeline.md, data-model.md.

## Acceptance

- pnpm check and pnpm test pass (including shared fixtures in both languages and the
  "no SDK imports outside adapters" check).
- With only a Groq key: upload a video -> transcript via Groq Whisper -> done.
- With Claude + Deepgram: same flow works.
- Switching the default provider in Settings changes the provider recorded in
  llm_calls for the next call.
- Handoff note written at plans/handoff-llm.md.
