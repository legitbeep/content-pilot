---
covers:
  - docs
last_updated: 2026-10-31
---
# Docs index

Open **only** the docs listed for the area you're changing. Each doc's `covers:` frontmatter
lists the code paths it describes; if you change one of those paths, update the doc.

## If you're changing X → read these
| Changing | Read |
|---|---|
| A page / route in `apps/web/src/routes` | `product/pages.md`, `architecture.md` |
| Web structure, FSD layers, `$lib/*` | `architecture.md` |
| UI, styling, app shell, shared components, shortcuts | `design/design-system.md`, `architecture.md` |
| Queue, job states, claiming, stop/retry | `queue.md`, `data-model.md` |
| A pipeline step (`apps/worker/pipeline`) | `pipeline.md`, `queue.md` |
| Timeline schema / zod / pydantic / fixtures | `timeline.md` |
| Rendering (timeline → FFmpeg) | `timeline.md`, `pipeline.md` |
| Editor agent, agent tools | `agent.md`, `timeline.md`, `brand-memory.md` |
| Brand rules, onboarding, learned rules | `brand-memory.md`, `data-model.md` |
| Publishing, YouTube, scheduler, metrics | `publishing.md`, `auth-and-keys.md` |
| Login, route protection, BYOK keys, demo allowlist, encryption | `auth-and-keys.md`, `env.md`, `llm.md` |
| Any AI call (LLM, transcription), model registry, AI buttons/guards | `llm.md` |
| A migration / table / RLS | `data-model.md` |
| Env vars, Docker, local setup | `env.md`, `architecture.md` |
| Deploying (web on Vercel, worker on a Google Cloud VM) | `deploy.md`, `env.md` |
| Checkpoints, scores, feature weights, apply_weights, LLM captions, Home, recommendations | `performance.md`, `publishing.md` |
| A big decision | `decisions/` (add one with the `new-adr` skill) |
| Unsure what a term means | `glossary.md` |

## All docs
- `product/spec.md` — condensed product spec and core rules.
- `product/pages.md` — every page: purpose, data, actions.
- `architecture.md` — components, diagram, FSD layers, local dev.
- `design/design-system.md` — tokens, type, radius, yellow budget, components, shell, shortcuts.
- `data-model.md` — every table, enums, RLS summary.
- `queue.md` — job states, transitions, claim query, stop/retry.
- `pipeline.md` — worker steps, inputs/outputs, failure behaviour.
- `timeline.md` — timeline schema, sync rule, FFmpeg mapping.
- `agent.md` — editor agent: planner, todo format, tools, memory proposals.
- `brand-memory.md` — stated vs learned rules, promotion, conflicts.
- `publishing.md` — YouTube OAuth, scheduler, checkpoints, scoring.
- `auth-and-keys.md` — Google login, BYOK encryption and validation.
- `llm.md` — LLM + transcription adapters, model registry, key resolution, demo allowlist, AI gating.
- `performance.md` — checkpoints, baselines, score/verdict, learned ranking, captions, Home.
- `deploy.md` — Vercel web deploy, Google Cloud VM worker, production checklist.
- `env.md` — every env var and where it's used.
- `glossary.md` — domain terms.
- `decisions/0001-monorepo.md` — pnpm monorepo + uv worker.
- `decisions/0002-postgres-queue.md` — Postgres jobs table, SKIP LOCKED.
- `decisions/0003-timeline-json.md` — timeline JSON is the only edit surface.
- `decisions/0004-byok.md` — users bring their own API keys.
- `decisions/0005-lint-choice.md` — ESLint + Prettier (web), ruff + pyright (worker).
- `decisions/0006-sveltekit-2.md` — stay on SvelteKit 2 + adapter-vercel; migrate to 3 later.
- `decisions/0007-claude-oauth-token.md` — (superseded by 0008) one server-wide Claude OAuth token.
- `decisions/0008-byok-only-ai-with-demo-allowlist.md` — AI uses the user's own keys; demo allowlist exception.
