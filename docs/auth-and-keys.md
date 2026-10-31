---
covers:
  - apps/web/src/lib/server
  - apps/web/src/hooks.server.ts
  - apps/web/src/routes/auth
  - apps/web/src/routes/login
  - apps/web/src/routes/(authed)
  - apps/web/eslint.config.js
  - apps/web/src/lib/entities/api-key
  - apps/web/src/lib/features/api-keys
  - apps/web/src/routes/(authed)/(shell)/settings
  - apps/worker/worker/crypto.py
  - apps/worker/worker/keys.py
  - fixtures/crypto.json
  - supabase/migrations
last_updated: 2026-11-01
---
# Auth and keys

## Login
Supabase Auth, Google provider only (configured in the Supabase dashboard). Web uses `@supabase/ssr`
with `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_PUBLISHABLE_KEY`; RLS does the rest. A `profiles`
row is created by the `on_auth_user_created` trigger on signup.

Flow:
1. `/login` (`routes/login`): one "Continue with Google" form. Its action calls
   `signInWithOAuth({ provider: 'google', redirectTo: <origin>/auth/callback })` and redirects to Google.
2. Google → Supabase → `/auth/callback?code=…` (`routes/auth/callback/+server.ts`):
   `exchangeCodeForSession(code)` (PKCE) sets the session cookie, then redirects to `/`. On failure
   it redirects to `/login?error=callback`.
3. `hooks.server.ts`: the `supabase` handle creates a per-request server client
   (`locals.supabase`) plus `locals.safeGetSession()`, which validates the JWT with `getUser()`.
   The `authGuard` handle sets `locals.session/user`. No session on anything except `/login` and
   `/auth/*` → 303 `/login`. Signed in on `/login` → 303 `/`. In dev, `/dev/*` skips both handles.
4. `routes/(authed)/+layout.server.ts|+layout.ts|+layout.svelte`: the Supabase SvelteKit
   pattern. It passes session + cookies down, builds a browser/server client in `+layout.ts`
   (`depends('supabase:auth')`), and `onAuthStateChange` → `invalidate('supabase:auth')`.
5. First login: `routes/(authed)/(shell)/+layout.server.ts` reads the user's
   `brand_profile.onboarding_completed_at`. Missing (no row or null) → 303 `/onboarding` (outside the
   shell, still protected); onboarding sends completed users to `/` (`docs/brand-memory.md`). TEMP: `SKIP_ONBOARDING=true`
   skips this redirect (`docs/env.md`); removed in plan10.
6. Sign out: the avatar menu POSTs to `/auth/signout` → `signOut()` → `/login`.

Route groups: `(authed)` = signed-in area (Supabase layouts). `(authed)/(shell)` = pages inside
the app shell. `onboarding` sits in `(authed)` but outside the shell.

**Secret-key guard**: `SUPABASE_SECRET_KEY` (and any `$env/*/private` import) may only appear in
`src/lib/server/**`, `*.server.ts` or `+server.ts`. ESLint `no-restricted-syntax` /
`no-restricted-imports` in `apps/web/eslint.config.js` fail `pnpm check` otherwise. SvelteKit's
own build-time check on `$env/*/private` is a second layer.

**Dev login** (for agents/automated checks, never in production): `$lib/server/dev-login.ts` +
`routes/auth/dev-login/+server.ts`. Enabled only when `dev` (`vite dev`) **and** `DEV_LOGIN=true`;
otherwise the route 404s and the login page hides the button (production builds have `dev=false`,
so it can't be switched on there). It ensures the test user `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD`
exists via the secret-key admin API (`createUser`, email pre-confirmed; existing user is fine), then
`signInWithPassword` on `locals.supabase`, which sets the normal session cookies.
- **Onboarded on login:** after sign-in it marks the test user onboarded, idempotently, so it
  lands on signed-in pages: inserts a `brand_profile` row (`answers = {"dev_login": true}`, upsert
  with `ignoreDuplicates`, so an existing profile is never overwritten), then sets
  `brand_profile.onboarding_completed_at` (what the shell gate reads) and `profiles.onboarded_at`
  where null. Same `devLoginEnabled()` guard; `devLogin()` refuses and writes nothing when it's off
  (tested). If the gate ever reads something else, update `completeOnboarding` in the same change.
- Agents: `GET /auth/dev-login?next=/queue` signs in and 303s to `next` (relative paths only,
  default `/`). `POST` does the same; the login page's "Dev login (test user)" button uses it.
- Needs email/password sign-in enabled in Supabase Auth (on by default). If the user already exists
  with another password, sign-in fails with a 500 — fix the password or delete the user.
- Test: `routes/auth/dev-login/dev-login.test.ts` (404 when the flag is off and when not in dev).

YouTube connect is a **separate** OAuth flow: `docs/publishing.md`.

## AI keys: BYOK only (ADR 0008)
There is no server-wide AI credential. Every AI call (LLM and transcription) runs on the user's
own key through the adapters in `docs/llm.md`. The only exception is the demo allowlist
(`DEMO_ALLOWED_EMAILS`: shared `GEMINI_API_KEY` / `GROQ_API_KEY`, verified email read server side,
daily job cap), also in `docs/llm.md`. Missing key → "Add an AI provider key in Settings to use this."

## BYOK
Settings → AI providers lists the providers in `$lib/entities/api-key/providers.ts`: **groq**
(LLM + transcription; one Groq key covers everything), **anthropic** (Claude, LLM), **gemini**
(LLM), **deepgram** (transcription with speaker labels) and **wispr** (optional voice input).
Uploading needs an LLM key and a transcription key (one Groq key is both); see "Gating AI actions" in
`docs/llm.md`. The `key_provider` enum also has `assemblyai`, not offered.

- **Storage format** (one format, both languages): AES-256-GCM, key = base64 `ENCRYPTION_KEY`
  (32 bytes). `user_keys.iv` = 12 random bytes per write; `user_keys.ciphertext` = encrypted
  bytes ‖ 16-byte GCM tag (what WebCrypto and `cryptography`'s `AESGCM` both produce natively).
  Web: `$lib/server/crypto.ts` (WebCrypto, writes bytea as `\x<hex>` through PostgREST).
  Worker: `worker/crypto.py`. Cross-language test: `fixtures/crypto.json` holds one value
  encrypted by each side; `crypto.test.ts` (vitest) and `tests/test_crypto.py` (pytest) each
  decrypt the other's.
- **Save** (`keyActions.save` in `$lib/server/keys.ts`, spread into Settings and onboarding step 1 → `saveKey`): validate with one
  cheap authenticated call (`$lib/server/llm/validate.ts`) → encrypt → upsert with the secret-key client
  (`$lib/server/supabase-admin.ts`; the table has no RLS policies). Saving clears `invalid_at`.
- **Validate** (checked 2026-10-31, no tokens used): anthropic `GET /v1/models?limit=1`
  (`x-api-key`, `anthropic-version: 2023-06-01`) · gemini `GET /v1beta/models?pageSize=1`
  (`x-goog-api-key`; a bad key is a 400, so 400 rejects too) · groq `GET /openai/v1/models`
  (Bearer) · deepgram `GET https://api.deepgram.com/v1/projects` (`Token <key>`) · wispr: below. 2xx → `validated_at = now()`;
  401/403 → save rejected with a message; network error / 5xx / timeout → saved as unverified.
- **Status** shown in Settings (`keyStatus()`): `valid` = `validated_at` set · `unverified` =
  `validated_at` null · `invalid` = `invalid_at` set (the worker got 401/403 using a saved key;
  the job fails with e.g. "Your Deepgram key was rejected. Update it in Settings."). Plus last 4 chars,
  the validated/saved date, and Replace / Remove. The full key never goes back to the browser.
- **Read for UI**: `user_keys_public` view → provider, last4, validated_at, invalid_at, created_at.
- **Worker use**: `worker/keys.py` `get_key(user_id, provider)` decrypts; `mark_valid` /
  `mark_invalid` set `validated_at` / `invalid_at` after the first real call.
- **Upload gate**: the Queue's Upload button is wrapped in `<RequiresAI need={['llm', 'transcription']}>`
  (disabled + tooltip + "Add a key in Settings"); the presign/create/retry actions call
  `requireAIKeys` (409 with the missing_key message). `docs/llm.md`.

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

OAuth refresh tokens (`platform_connections`) use the same scheme.

Rotating `ENCRYPTION_KEY` invalidates every stored key/token (users re-enter). Fine for a hackathon.
