---
covers:
  - apps/web/src/lib/server
  - supabase/migrations
last_updated: 2026-10-31
---
# Auth and keys

## Login
Supabase Auth, Google provider (configured in the Supabase dashboard). Web uses `@supabase/ssr`
(not installed yet) in `hooks.server.ts` with `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`;
RLS does the rest. A `profiles` row is created by trigger on signup.

YouTube connect is a **separate** OAuth flow: `docs/publishing.md`.

## BYOK
Providers: `anthropic`, `deepgram` | `assemblyai` | `groq` (transcription), `wispr` (optional).

- **Encrypt**: AES-256-GCM, key = `APP_ENCRYPTION_KEY` (base64, 32 bytes), random 12-byte IV per
  write. Store `ciphertext` (incl. auth tag) + `iv` + `last4` in `user_keys`. Web: WebCrypto in
  `$lib/server`. Worker: `cryptography` `AESGCM` (add the dep when needed). Same format both sides.
- **Write**: server action only, with the service-role client (table has no RLS policies).
- **Read for UI**: `user_keys_public` view → provider, last4, validated_at. Plaintext and
  ciphertext never reach the browser.
- **Validate on save** (cheap authenticated call; reject the save on 401/403):
  anthropic `GET /v1/models` · deepgram `GET /v1/projects` · assemblyai `GET /v2/transcript?limit=1`
  · groq `GET /openai/v1/models` · wispr: see below. Set `validated_at` on success.
- **Unverified** = `validated_at is null`: saved but not confirmed (network error, provider 5xx,
  timeout). Validated on first use; set `validated_at` then, or surface the error at that point.

### Wispr (optional, never blocks the user)
Voice is optional and typing always works, so a Wispr problem never blocks onboarding or saving.
- Validate with `POST https://platform-api.wisprflow.ai/api/v1/dash/generate_access_token`,
  `Authorization: Bearer <org key fl-…>`, body `{ "client_id": "<user id>", "duration_secs": 60 }`.
  No audio, so nothing is transcribed. `200` → set `validated_at`; `401` → tell the user the key
  was rejected (they can retry or skip voice); anything else → save as unverified.
- Fallback if that endpoint ever stops fitting: transcribe 1s of silent 16 kHz WAV via
  `POST /api/v1/dash/api`; if still unclear, save unverified.
- Browser voice uses the same endpoint: the editor's server route mints a short-lived client
  JWT for the user so the org key never reaches the browser.
- Source: api-docs.wisprflow.ai (`generate_access_token.md`, `rest_api_transcribe.md`), checked 2026-10-31.
- OAuth refresh tokens (`platform_connections`) use the same scheme.

Rotating `APP_ENCRYPTION_KEY` invalidates every stored key/token (users re-enter). Fine for a hackathon.
