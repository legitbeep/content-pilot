# apps/web

SvelteKit 2 app (deploys to Vercel). Read `docs/architecture.md` first; page specs in
`docs/product/pages.md`.

## Layout

- `src/routes/` — one folder per page (see `docs/product/pages.md`). Routes compose widgets/features.
- `src/lib/` — Feature-Sliced Design: `widgets → features → entities → shared` (import downward only).
  Slices: `src/lib/<layer>/<slice>/index.ts` (public API of the slice).
- `src/lib/server/` — server-only: Supabase service client, key crypto, R2 presign, editor agent.

## Commands (from repo root)

`pnpm dev`, `pnpm --filter web check`, `pnpm --filter web lint`, `pnpm --filter web format`.

## Area docs

- Editor agent → `docs/agent.md` · Timeline → `docs/timeline.md`
- Login, BYOK → `docs/auth-and-keys.md` · Publishing → `docs/publishing.md`
