---
covers:
  - apps/web/eslint.config.js
last_updated: 2026-10-31
---
# 0005 — ESLint + Prettier for web, ruff + pyright for worker

**Status:** accepted

**Context.** Need one lint/format setup for Svelte 5 + TS.

**Decision.** ESLint (`eslint-plugin-svelte`, typescript-eslint) + Prettier (`prettier-plugin-svelte`),
as scaffolded by `sv`. Not Biome: its Svelte support doesn't fully cover template syntax, and
svelte-specific rules (e.g. `svelte/no-navigation-without-resolve`) only exist for ESLint.
Worker: ruff (lint + format) and pyright in basic mode.

**Consequences.** Two JS tools instead of one, slower than Biome. Revisit if Biome ships full
Svelte support.
