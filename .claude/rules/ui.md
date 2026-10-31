---
paths:
  - "apps/web/src/**/*.svelte"
---
# UI rules

Read `docs/design/design-system.md` before changing UI; review at `/dev/ui`.

- **Tokens only**: Tailwind classes backed by `app.css` tokens (`bg-surface`, `text-muted-foreground`,
  `border-border-strong`, …). Never raw hex or arbitrary colors.
- **Reuse `$lib/shared/ui` first** (shadcn + PageHeader, EmptyState, StatusBadge, Timecode,
  DataTable, TopbarActions, Kbd). New shared component → `add-ui-component` skill.
- **Yellow budget**: at most one primary (default variant) button per view; yellow otherwise only
  for focus/active/selection/playhead. Never large fills, body text or decoration.
- **Sentence case** for all copy. No all-caps, no eyebrow labels, no arrows on buttons.
- **No shadows, gradients or glassmorphism**; hierarchy via 1px borders and background steps.
- **Motion only in response to user actions**, honoring `prefers-reduced-motion`.
- Mono font only for timecodes, durations and IDs.
- New shortcut → `$lib/shared/config/shortcuts.ts`; new top-level page → `$lib/shared/config/nav.ts`.
