---
paths:
  - "apps/web/**"
---
# Web rules

- **FSD layers** in `src/lib`: `widgets → features → entities → shared`. A layer imports only
  layers below it; slices in the same layer import each other only via `shared`/`entities`.
  Each slice exposes its public API from `index.ts`; import the slice, not its internals.
- **Svelte 5 runes only**: `$state`, `$derived`, `$effect`, `$props`, `{@render}`, snippets.
  Use `onclick={...}` event attributes and callback props.
- **Server-only code lives in `$lib/server`** (secrets, secret-key (`SUPABASE_SECRET_KEY`) client, crypto, R2 presign,
  agent) or in `+page.server.ts` / `+server.ts`. Client code imports from `$lib/server` fail the build by design.
- Video bytes go browser → R2 via presigned URL; request bodies to SvelteKit carry JSON only.
- New top-level folder in `src/lib` → its `index.ts` starts with `// Docs: docs/<doc>.md`.
