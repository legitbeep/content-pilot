---
name: add-page
description: Add a SvelteKit page/route in apps/web following Feature-Sliced Design.
---
# Add a page

1. Read `docs/product/pages.md` and `docs/architecture.md`.
2. Create `apps/web/src/routes/(authed)/(shell)/<route>/+page.svelte` (Svelte 5 runes; signed-in, inside
   the app shell). Start with `PageHeader` + `EmptyState` from `$lib/shared/ui`. Data loading in
   `+page.server.ts` (`load`, form `actions`); server-only helpers in `$lib/server`.
3. Put UI blocks in FSD slices: entity UI → `$lib/entities/<entity>/`, user actions →
   `$lib/features/<feature>/`, composed sections → `$lib/widgets/<widget>/`, each with an `index.ts`.
4. Add the page to `$lib/shared/config/nav.ts` (sidebar, palette, breadcrumbs); add a `G` shortcut in
   `shortcuts.ts` if it's top-level. Links use `resolve()` from `$app/paths`.
5. Add a row to `docs/product/pages.md` (route, purpose, data, actions).
6. Update affected docs + run `pnpm check`.
