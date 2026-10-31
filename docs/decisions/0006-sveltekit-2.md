---
covers:
  - apps/web/svelte.config.js
  - apps/web/package.json
last_updated: 2026-10-31
---
# 0006 — SvelteKit 2 (not 3) with adapter-vercel

**Status:** accepted

**Context.** `sv create` now scaffolds SvelteKit 3 (`#lib` alias, config in `vite.config.ts`).
shadcn-svelte and the Supabase SSR guides still target SvelteKit 2.

**Decision.** Pin `@sveltejs/kit` ^2.70 with `svelte.config.js` and the `$lib` alias. Deploy to
Vercel with `@sveltejs/adapter-vercel` ^6.

**Consequences.** Ecosystem examples work as written. We're one major behind.
**Follow-up:** migrate later via `npx sv migrate sveltekit-3`.
