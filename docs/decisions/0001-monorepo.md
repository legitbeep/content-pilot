---
covers:
  - pnpm-workspace.yaml
  - package.json
last_updated: 2026-10-31
---
# 0001 — Monorepo with pnpm workspaces

**Status:** accepted

**Context.** Web (TS), worker (Python) and a shared timeline contract change together; agents
need the whole system in one place.

**Decision.** One repo. pnpm workspaces for JS (`apps/web`, `packages/*`); the Python worker is
managed by uv in `apps/worker` and wired into root scripts (`pnpm check|test|worker`).

**Consequences.** One PR covers contract + both sides. Python isn't a pnpm workspace member, so
root scripts call `uv run --directory apps/worker` explicitly.
