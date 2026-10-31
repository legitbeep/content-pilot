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
  - apps/worker/worker/claude.py
  - apps/worker/worker/crypto.py
  - apps/worker/worker/keys.py
  - fixtures/crypto.json
  - supabase/migrations
last_updated: 2026-10-31
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
5. First login: `routes/(authed)/(shell)/+layout.server.ts` looks up the user's `brand_profile`
   row. If there is none → 303 `/onboarding` (outside the shell, still protected).
6. Sign out: the avatar menu POSTs to `/auth/signout` → `signOut()` → `/login`.

Route groups: `(authed)` = signed-in area (Supabase layouts). `(authed)/(shell)` = pages inside
the app shell. `onboarding` sits in `(authed)` but outside the shell.

**Secret-key guard**: `SUPABASE_SECRET_KEY` (and any `$env/*/private` import) may only appear in
`src/lib/server/**`, `*.server.ts` or `+server.ts`. ESLint `no-restricted-syntax` /
`no-restricted-imports` in `apps/web/eslint.config.js` fail `pnpm check` otherwise. SvelteKit's
own build-time check on `$env/*/private` is a second layer.

YouTube connect is a **separate** OAuth flow: `docs/publishing.md`.

## Claude (server-wide, not BYOK)
All AI steps (editor agent in web, brand fit + clip extraction in the worker) share one Claude
OAuth token, `CLAUDE_OAUTH_TOKEN` (from `claude setup-token`), set in both `.env` files. ADR 0007.
- Web: `claude()` in `$lib/server/claude.ts`; worker: `claude()` in `apps/worker/worker/claude.py`.
  Both send it as `Authorization: Bearer` with `anthropic-beta: oauth-2025-04-20`, model
  `CLAUDE_MODEL` (`claude-opus-5-5`). Missing token → the call throws with the env file to fix.
- Server only: same ESLint guard as `SUPABASE_SECRET_KEY` (it lives in `$lib/server`).
- Users never enter a Claude key; usage and limits are the token owner's.

## BYOK
Settings → API keys lists the providers in `$lib/entities/api-key/providers.ts`: **deepgram**
(required: transcription) and **wispr** (optional: voice input in the editor). There is no
Anthropic key: Claude is the server-wide token above. The `key_provider` enum also has
`assemblyai`/`groq` for later; they are not offered yet.

- **Storage format** (one format, both languages): AES-256-GCM, key = base64 `ENCRYPTION_KEY`
  (32 bytes). `user_keys.iv` = 12 random bytes per write; `user_keys.ciphertext` = encrypted
  bytes ‖ 16-byte GCM tag (what WebCrypto and `cryptography`'s `AESGCM` both produce natively).
  Web: `$lib/server/crypto.ts` (WebCrypto, writes bytea as `\x<hex>` through PostgREST).
  Worker: `worker/crypto.py`. Cross-language test: `fixtures/crypto.json` holds one value
  encrypted by each side; `crypto.test.ts` (vitest) and `tests/test_crypto.py` (pytest) each
  decrypt the other's.
- **Save** (`settings/+page.server.ts` → `saveKey` in `$lib/server/keys.ts`): validate with one
  cheap authenticated call → encrypt → upsert with the secret-key client
  (`$lib/server/supabase-admin.ts`; the table has no RLS policies). Saving clears `invalid_at`.
- **Validate** (checked 2026-10-31): deepgram `GET https://api.deepgram.com/v1/projects` with
  `Authorization: Token <key>` · wispr: see below. 2xx → `validated_at = now()`;
  401/403 → save rejected with a message; network error / 5xx / timeout → saved as unverified.
- **Status** shown in Settings (`keyStatus()`): `valid` = `validated_at` set · `unverified` =
  `validated_at` null · `invalid` = `invalid_at` set (the worker got 401/403 using a saved key;
  the job fails with "Deepgram rejected the API key. Update it in Settings."). Plus last 4 chars,
  the validated/saved date, and Replace / Remove. The full key never goes back to the browser.
- **Read for UI**: `user_keys_public` view → provider, last4, validated_at, invalid_at, created_at.
- **Worker use**: `worker/keys.py` `get_key(user_id, provider)` decrypts; `mark_valid` /
  `mark_invalid` set `validated_at` / `invalid_at` after the first real call.
- **Upload gate**: Queue shows "Add your Deepgram key to start." with a link to Settings while a
  required key is missing (`missingRequired()`); the presign route refuses too.

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
