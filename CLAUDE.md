# Clip Studio

Content repurposing studio with brand memory. A creator uploads a long video (incl. video
podcasts); the worker transcribes it, checks it, and extracts short clips with reasons. The
creator edits clips (manually or via an editor agent) as timeline JSON, the worker renders them
with FFmpeg, and they're posted to YouTube or scheduled. The system learns brand rules from edits
and real performance, and always asks before adopting them. Hackathon project.

## Before working on any area
Read `docs/INDEX.md` and open only the docs it lists for that area. Docs are reached on demand;
each one's `covers:` frontmatter names the code it describes.

## Stack
- `apps/web` — SvelteKit 2 + Svelte 5 (runes), TypeScript strict, Feature-Sliced Design in
  `src/lib`, adapter-vercel, ESLint + Prettier.
- `apps/worker` — Python 3.12 (uv), pydantic, psycopg, boto3, FFmpeg in Docker, ruff + pyright.
- `packages/timeline-schema` — JSON Schema source of truth + zod mirror; pydantic mirror lives in the worker.
- Supabase (hosted Postgres + Google login), Cloudflare R2 (video, presigned browser uploads),
  Postgres `jobs` table as the queue (`FOR UPDATE SKIP LOCKED`).

## Repo map
- `apps/web/` — UI, server routes, editor agent, BYOK + OAuth handling.
- `apps/worker/` — job loop, pipeline steps, rendering, scheduler, metrics.
- `packages/timeline-schema/` — timeline contract + shared fixtures.
- `supabase/` — config and SQL migrations (schema + RLS).
- `docs/` — product, architecture and per-area docs; ADRs in `docs/decisions/`.
- `fixtures/` — cross-language test fixtures (`crypto.json`).
- `scripts/` — repo tooling (`check-docs.ts`).
- `.claude/` — settings, path-scoped rules, skills.

## Commands (root)
- `pnpm install` — JS deps. Worker deps: `uv sync --directory apps/worker`.
- `pnpm dev` — web dev server (uses hosted Supabase/R2 from `apps/web/.env`).
- `pnpm worker` — worker in Docker.
- `pnpm check` — typecheck + lint (web, schema, worker) + docs check. Must pass before finishing.
- `pnpm test` — vitest (schema, web) + pytest (worker), incl. the cross-language crypto test.

## Hard rules
1. Any code change updates the docs whose `covers:` include that path, in the same change.
2. Secrets live only in `.env` (gitignored); code and docs use placeholders, as in `apps/web/.env.example` and `apps/worker/.env.example`.
3. Timeline JSON is the only way to change a clip; web code edits timelines, the worker renders video.
4. Agent tools propose brand-memory changes; only an explicit user action writes `brand_rules`.
5. Prefer small, explicit modules over clever abstractions; this is a hackathon.

## Conventions
- Every module entry file starts with a one-line `// Docs: docs/<doc>.md` (`# Docs:` in Python).
- Skills in `.claude/skills/` cover the common changes: add-migration, add-pipeline-step,
  add-agent-tool, add-page, add-ui-component, change-timeline-schema, sync-docs, new-adr.
- Big decisions get an ADR (`new-adr` skill).
