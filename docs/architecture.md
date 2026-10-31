---
covers:
  - apps/web/src/lib
  - apps/web/components.json
  - apps/web/svelte.config.js
  - apps/worker/main.py
  - docker-compose.yml
last_updated: 2026-10-31
---
# Architecture

```mermaid
flowchart LR
  B[Browser] -->|SvelteKit pages + server routes| W[apps/web on Vercel]
  B -->|PUT via presigned URL| R2[(Cloudflare R2)]
  W -->|publishable key + user JWT, RLS| DB[(Supabase Postgres)]
  W -->|secret key: keys, tokens| DB
  W -->|Claude OAuth token| A[Claude: editor agent + pipeline AI]
  K -->|Claude OAuth token| A
  K[apps/worker in Docker] -->|claim jobs FOR UPDATE SKIP LOCKED| DB
  K -->|read source, write renders| R2
  K -->|transcription BYOK| T[Deepgram / AssemblyAI / Groq]
  K -->|upload + stats| Y[YouTube Data API]
  W -->|OAuth connect| Y
  B -->|Google login| S[Supabase Auth]
```

## Responsibilities
- **apps/web** (SvelteKit 2, adapter-vercel): UI, auth session, presigning uploads, BYOK save +
  validation, editor agent (server routes), enqueueing jobs/renders. Never touches video bytes.
- **apps/worker** (Python, Docker, FFmpeg): one loop that claims queue jobs, runs the pipeline,
  renders timelines, publishes scheduled posts, collects metric checkpoints.
- **packages/timeline-schema**: the contract between editor and renderer.
- **Supabase**: Postgres (data + queue) and Google login. Hosted even in local dev.
- **R2**: all video. Browser uploads directly via presigned URLs.

## Web: Feature-Sliced Design inside `src/lib`
Layers (import only downward): `widgets → features → entities → shared`. Routes (`src/routes`)
compose widgets/features. `src/lib/server` is SvelteKit's server-only folder (`$lib/server`),
outside FSD layering: secrets, Supabase service client (`supabase-admin.ts`), crypto, keys,
R2 presign, agent.
Each layer has an `index.ts` with a `// Docs:` header; slices go in `src/lib/<layer>/<slice>/`.

Today's slices:
- `shared/ui/*`: shadcn-svelte components (generated, aliases in `components.json`) plus ours
  (page-header, empty-state, status-badge, timecode, data-table, topbar-actions). See
  `docs/design/design-system.md`.
- `shared/lib/utils.ts` (`cn` + shadcn prop types), `shared/lib/is-typing.ts`, `shared/lib/hooks/`.
- `shared/config/`: `nav.ts` (one route list for sidebar, palette, breadcrumbs) and
  `shortcuts.ts` (every keyboard shortcut).
- `widgets/app-shell`: sidebar, top bar, command palette, shortcut sheet, key handler.
- `entities/api-key`: BYOK provider list, key status. `features/api-keys`: Settings key row.
- `entities/job`: job/transcript types, upload limits, transitions. `features/upload-video`:
  dropzone + presigned upload. `widgets/job-queue`: queue list + details sheet (`docs/queue.md`).
- `shared/lib/form-action.ts` (`formAction()`: call a page's form action from JS).

Routes: `(authed)/(shell)/*` render inside `AppShell`; `(authed)/onboarding` is protected but
full-screen; `login` and `auth/*` are public. Auth flow: `docs/auth-and-keys.md`.

## Local dev
`pnpm dev` runs web against hosted Supabase/R2. `pnpm worker` runs the worker in Docker
(`docker-compose.yml`, only service). Env: `docs/env.md`.
