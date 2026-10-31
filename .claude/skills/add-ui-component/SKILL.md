---
name: add-ui-component
description: Add a shared UI component to apps/web — a shadcn-svelte component or a hand-built one in $lib/shared/ui.
---
# Add a UI component

1. Read `docs/design/design-system.md`. Check `/dev/ui` and `$lib/shared/ui` first: reuse or
   extend before adding.
2. **shadcn component**: from `apps/web`, `pnpm dlx shadcn-svelte@latest add -y <name>` (installs to
   `$lib/shared/ui/<name>` via `components.json`). Then align it with the system:
   - `accent` is the brand violet: replace hover usages
     `perl -pi -e 's/(?<![\w-])bg-accent(?![\w-])/bg-elevated/g; s/(?<![\w-])text-accent-foreground(?![\w-])/text-foreground/g' src/lib/shared/ui/<name>/*.svelte`
   - Radius: inputs/badges `rounded-sm`, buttons `rounded-md`, popovers/menus `rounded-lg`,
     cards/dialogs `rounded-xl`
     (shadcn ships `rounded-lg`/`rounded-xl`/`rounded-4xl` in places).
   - Only `shadow-overlay` and `shadow-glow` exist; swap stock `shadow-md/lg` for `shadow-overlay`.
   - No glassmorphism: remove `backdrop-blur*`; overlays use a flat `bg-black/50`.
3. **Hand-built component**: `$lib/shared/ui/<kebab-name>/<kebab-name>.svelte` + `index.ts`
   exporting it in PascalCase. Svelte 5 runes, tokens only, sentence case, compose shadcn parts.
   If it needs product data, it belongs in `entities/` or `features/`, not `shared/`.
4. Add it to `apps/web/src/routes/dev/ui/+page.svelte` in **every state** (default, hover-able,
   disabled, invalid, empty, loading, as applicable).
5. Add it to the component inventory in `docs/design/design-system.md`.
6. Update affected docs + run `pnpm check`.
