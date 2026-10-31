---
paths:
  - "apps/web/src/**/*.svelte"
---
# UI rules

Read `docs/design/design-system.md` before changing UI; review at `/dev/ui`.

- **Tokens only**: Tailwind classes backed by `app.css` tokens (`bg-surface`, `text-muted-foreground`,
  `border-border-strong`, …). Never raw hex or arbitrary colors.
- **Reuse `$lib/shared/ui` first** (shadcn + PageHeader, EmptyState, StatusBadge, Timecode,
  DataTable, TopbarActions, Kbd, Card, Stat, CopyButton). New shared component → `add-ui-component` skill.
- **Accent (violet) budget**: at most one primary (default variant) button per view; violet otherwise
  only for focus/active/selection/playhead, `accent-subtle` tints and `text-accent-text` links.
  Never large solid fills or body text.
- **Sentence case** for all copy. No all-caps, no eyebrow labels, no arrows on buttons.
- **Depth**: 1px borders and background steps first. Allowed extras, via tokens only:
  `bg-gradient-surface`, `bg-gradient-accent` (thin marks), `bg-abstract` (hero/empty/dropzone/login
  backdrops), `shadow-overlay` (floating layers), `shadow-glow` (primary hover). No glassmorphism.
- **Motion is subtle**: default 150ms transitions, `animate-in-fade` on entry, skeleton shimmer;
  no idle/looping decoration. `prefers-reduced-motion` is honored globally.
- Mono font only for timecodes, durations and IDs.
- New shortcut → `$lib/shared/config/shortcuts.ts`; new top-level page → `$lib/shared/config/nav.ts`.
