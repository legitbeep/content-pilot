# apps/web

SvelteKit 2 app (deploys to Vercel). Read `docs/architecture.md` first; page specs in
`docs/product/pages.md`.

## Layout

- `src/routes/` — one folder per page (see `docs/product/pages.md`). Routes compose widgets/features.
  App pages live in `(authed)/(shell)/`; `login`, `auth/*` are public; `dev/ui` is the design review page.
- `src/lib/` — Feature-Sliced Design: `widgets → features → entities → shared` (import downward only).
  Slices: `src/lib/<layer>/<slice>/index.ts` (public API of the slice).
- `src/lib/server/` — server-only: Supabase secret-key client, key crypto, R2 presign, editor agent.
- `src/lib/shared/ui/` — shadcn-svelte + our shared components; `src/lib/widgets/app-shell/` — shell.
- Env: `apps/web/.env` (template `.env.example`, reference `docs/env.md`).

## Commands (from repo root)

`pnpm dev`, `pnpm --filter web check`, `pnpm --filter web lint`, `pnpm --filter web format`.

## Area docs

- Editor agent → `docs/agent.md` · Timeline → `docs/timeline.md`
- Login, BYOK → `docs/auth-and-keys.md` · Publishing → `docs/publishing.md`
- UI, tokens, shell, shortcuts → `docs/design/design-system.md` (rules: `.claude/rules/ui.md`)
