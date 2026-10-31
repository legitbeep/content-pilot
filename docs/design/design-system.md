---
covers:
  - apps/web/src/app.css
  - apps/web/src/lib/shared/ui
  - apps/web/src/lib/shared/config
  - apps/web/src/lib/widgets/app-shell
  - apps/web/src/routes/dev
  - apps/web/components.json
last_updated: 2026-11-01
---
# Design system

Linear-style product UI with a creator-tool edge (Frame.io, Riverside): quiet, dense, fast,
keyboard-first, on a cool near-black canvas with one electric-violet accent. Content is the loudest
thing on screen. Hierarchy comes from 1px borders and background steps; subtle gradients, soft
abstract glows and short micro-interactions add polish, never noise. Review everything at `/dev/ui`
(dev only, no sign-in needed).

## Tokens (`apps/web/src/app.css`)
Raw tokens live on `:root`. Dark is the only theme; `<html class="dark">` is set in `app.html`. A
light theme later = one block redefining the raw tokens. Never use raw hex in components.

| Token | Value | Use | Tailwind |
|---|---|---|---|
| `--bg-canvas` | #0C0C11 | App background | `bg-background` / `bg-canvas` |
| `--bg-subtle` | #101016 | Inset wells: inputs, select, table header, tab list | `bg-subtle` |
| `--bg-surface` | #131319 | Sidebar, panels, cards | `bg-card` / `bg-surface` / `bg-sidebar` |
| `--bg-elevated` | #1B1B23 | Popovers, modals, hover rows, secondary buttons | `bg-popover` / `bg-muted` / `bg-elevated` |
| `--border` | #26262F | Default 1px border | `border` (default color) |
| `--border-strong` | #363642 | Hovered/active containers | `border-border-strong` |
| `--text` | #EDEDF2 | Primary text (16.7:1 on canvas) | `text-foreground` |
| `--text-muted` | #9898A6 | Secondary text, metadata (6:1 on elevated) | `text-muted-foreground` |
| `--accent` | #7357FF | Primary button, focus ring, active nav, playhead, selection | `bg-primary` / `bg-accent` / `ring-ring` |
| `--accent-fg` | #FFFFFF | Text on violet (4.6:1) | `text-primary-foreground` |
| `--accent-text` | #B4A6FF | Violet text/links/icons on dark (8:1) | `text-accent-text` |
| `--accent-subtle` | accent 14% | Tinted fills: needs-input badge, selected row, "suggested" | `bg-accent-subtle` |
| `--success` | #3ECF8E | Done, positive delta | `text-success` |
| `--danger` | #FF5C62 | Failed, destructive, negative delta | `text-danger` / `destructive` |
| `--info` | #5EB0FF | Processing, charts, loading bar | `text-info` |
| `--warning` | #F5A524 | Warnings | `text-warning` |
| `--caption` | #F472B6 | Editor caption track (pink so it never reads as the accent) | `bg-caption` |

shadcn semantic vars (`--background`, `--primary`, `--sidebar-*`, …) are mapped onto these in
`app.css`. **`accent` means the brand violet everywhere.** Stock shadcn uses `bg-accent` for hover
rows, so generated components were rewritten to use `bg-elevated` instead, and overlay blur was
replaced with a flat `bg-black/50` (see the `add-ui-component` skill). `shadcn-svelte/tailwind.css`
(imported in `app.css`) supplies the `data-open:`, `data-checked:`, `data-active:` … variants.
`--accent` as text on canvas is only 4.2:1: for violet **text** use `text-accent-text`.

### Accent budget
At most **one primary (violet) button per view**, plus focus rings, the active-nav indicator,
playhead, selection, `accent-subtle` tints and `text-accent-text` links. Never use violet for large
solid fills or body text. Status uses `StatusBadge`; a violet `Badge variant="accent"` marks
"suggested"/"new"/AI output only. A dialog is its own view: it may have one primary
button even if the page behind has one.

### Gradients, glow, abstract backdrop
All defined in `app.css`; use the utilities, never hand-written gradients.

| Utility | Token | Use |
|---|---|---|
| `bg-gradient-surface` | `--gradient-surface` | Faint top light on cards/panels (`Card` has it) |
| `bg-gradient-accent` | `--gradient-accent` (violet to pink) | 1-2px accent bars/borders, tiny marks only |
| `bg-abstract` | three low-opacity radial glows (violet, pink, blue) | Behind page heroes, empty states, the upload dropzone, login. Container needs `relative overflow-hidden` |
| `shadow-overlay` | `--shadow-overlay` | Popovers, menus, selects, dialogs |
| `shadow-glow` | `--glow-accent` | Primary button hover; at most one glowing thing per view |

No glassmorphism (`backdrop-blur`), no illustrations or literal imagery in backdrops, no gradient
text.

## Type
- UI: Hanken Grotesk 400/500/600 (`@fontsource`, imported in `routes/+layout.svelte`).
- Mono: JetBrains Mono, **only** for timecodes, durations and IDs (`font-mono`, `Timecode`).
- Scale (Tailwind classes remapped): `text-xs` 12 · `text-sm` 13 (base UI, body default) ·
  `text-base` 14 · `text-lg` 16 · `text-xl` 20 (page title) · `text-2xl` 24.
- Only these weights are loaded: 400 (body), 500 (`font-medium`: titles, labels, buttons),
  600 (`font-semibold`: page titles, stat values). No `font-bold`/`font-light` (they'd be faux
  weights); the one exception is the editor's caption preview, which mimics the burned-in caption.
- Roles:

  | Role | Classes |
  |---|---|
  | Page title (`PageHeader`, error, login) | `text-xl font-semibold tracking-tight` |
  | Section title (Home sections), card title (`Card`), dialog title | `text-base font-medium` |
  | Panel/callout title (editor panels, agent chat, dialog callouts) | `text-sm font-medium` |
  | Group label (dialog sections, editor sidebar) | `text-xs font-medium text-muted-foreground` |
  | Body | `text-sm` (inherited from `body`) |
  | Meta (times, counts, hints) | `text-xs text-muted-foreground`, `tabular-nums` on numbers |
  | Form label (`Label`) | `text-sm font-medium` |
  | Timecode / duration / ID | `Timecode` or `font-mono` (never percents, scores or sizes; those get `tabular-nums`) |
- Controls inherit the UI font (Tailwind preflight `font: inherit`). `Input`/`Textarea` are
  `text-lg` (16px) below `md` so iOS doesn't zoom on focus, `text-sm` from `md` up.
- Sentence case everywhere. No all-caps labels, no eyebrow labels above headings, no arrows
  appended to buttons.

## Radius, shadow, motion
- `rounded-sm` 4px (inputs, badges, kbd) · `rounded-md` 6px (buttons, menu items) ·
  `rounded-lg` 8px (popovers, menus, small tiles) · `rounded-xl` 12px (cards, dialogs, tables,
  empty states). Avatars/switches/sliders stay round.
- Stock shadows are removed at the theme level (`--shadow-*: initial`); only `shadow-overlay` and
  `shadow-glow` exist.
- Motion: `--duration-fast` 150ms (default for every `transition*` class), `--duration-base` 200ms
  (entry), one easing `--ease-out-soft`. `animate-in-fade` (fade + 4px rise) for things that
  appear (page header, empty state, lists that load in); overlays use tw-animate `data-open:animate-in`
  at 150ms; buttons press to `scale-[0.98]`; `Skeleton` uses the `shimmer` sweep; the processing
  dot pulses. No idle/looping decoration. A global `prefers-reduced-motion` block zeroes it all.

## Layout and spacing
- Page: the app shell gives padding and `max-w-5xl`; pages stack sections with `gap-8`
  (`flex flex-col gap-8`), items within a section `gap-3`/`gap-4`. `PageHeader` brings its own
  `pb-6`.
- Grids: cards `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`; stat rows `grid gap-4 sm:grid-cols-3`.
- Card padding `p-4` (default), `p-6` for hero/onboarding panels. Form fields `grid gap-1.5`
  (label + control), forms `grid gap-4 max-w-md`.

## Icons
- `@lucide/svelte` only, imported per icon: `import UploadIcon from '@lucide/svelte/icons/upload'`.
- Default `size-4`, stroke 1.5 (global `.lucide` rule). Buttons size their icons automatically
  (`xs`/`sm` buttons shrink them); don't add size classes inside buttons. `size-3` in badges,
  table sort arrows and stat deltas; `size-5` max (empty-state media).
- Icons inherit `currentColor`; color them through the parent's text token. Icon before label.
- Icon-only buttons: `Button size="icon" | "icon-sm" | "icon-xs"` + `variant="ghost"` + an
  `aria-label`. No separate IconButton.

## Components
Generated by shadcn-svelte into `$lib/shared/ui/<name>` (aliases in `apps/web/components.json`):
avatar, badge, breadcrumb, button, calendar, command, dialog, dropdown-menu, empty, input,
input-group, kbd, label, popover, scroll-area, select, separator, sheet (only the mobile sidebar uses it), sidebar, skeleton,
slider, sonner, switch, table, tabs, textarea, tooltip.

Ours, in `$lib/shared/ui`:
| Component | API | Notes |
|---|---|---|
| `PageHeader` | `title`, `description?`, `actions?` snippet | `text-xl` semibold tight title, fades in; actions wrap below the title on narrow screens |
| `EmptyState` | `icon`, `text`, `action?: {label, href? \| onclick?}`, `backdrop?` (default true) | One sentence, at most one (primary) action. Dashed `rounded-xl` box on `bg-abstract` (`backdrop={false}` when the view already has one), violet icon tile |
| `StatusBadge` | `status: JobStatus` | Tinted pill: pending muted · processing info + pulse · needs_input violet (`accent-subtle`) · done success · stopped muted + slash icon · failed danger |
| `Card` | `title?`, `description?`, `actions?` snippet, `href?`, `class?`, children | `rounded-xl border bg-surface bg-gradient-surface p-4` section. Header renders when `title` or `actions`. `href` makes the whole card a link with hover lift; no nested links then |
| `CopyButton` | `value`, `label?` (default "Copy"; use "Copy job ID"), `class?` | Ghost `icon-xs` button; copies, toasts "Copied", swaps to a green check for 1.5s. Stops click propagation, so it's safe in clickable rows/cards |
| `Stat` | `label`, `value: string \| number`, `delta?: number` (percent), `hint?`, `class?` | Label xs muted, value `text-2xl` tabular, delta green/red with trend icon. Put in a `Card` |
| `Timecode` / `formatTimecode` | `seconds`, `whole?` (`formatTimecode(s, { whole })`) | `01:23.4`, `1:02:03.5`; `whole`: `0:05`, `1:02:05` (durations, transcript times); mono, tabular numbers |
| `DataTable` | `columns: Column<T>[]`, `rows`, `empty?` snippet, `onrowclick?` | `rounded-xl` bordered surface, `bg-subtle` xs muted header, 44px rows. Click header to sort asc → desc → none; hover row `bg-elevated/60` |
| `TopbarActions` | children | Puts page actions in the top bar (renders after hydration) |
| `BarChart` | `data: {label, value}[]`, `label` (accessible name), `format?` | Plain vertical bars in `bg-info`, no chart library; values in hover titles + an sr-only list. Shows every x label when ≤ 6 bars, else first/last |
| `ChipsInput` | `value` (bindable string[]), `label`, `max?`, `placeholder?`, `disabled?` | Enter/comma adds, Backspace on empty removes last, case-insensitive dedupe; disabled when full |
| Kbd | shadcn `kbd` as-is | `Kbd.Root`, `Kbd.Group` |

Dialogs: `Dialog.Content size="sm"` (default) is the compact confirm dialog (padded, `Header` +
`Footer`). `size="md" | "lg" | "xl"` (max-w lg / 2xl / 3xl) is a panel: `max-h-[85svh]`,
`rounded-xl` with `overflow-hidden`, a fixed `Dialog.Header` (border-b) and `Dialog.Footer`
(border-t) around a scrolling `Dialog.Body`. Split a long body into sections with
`Dialog.Body class="flex flex-col divide-y p-0 [&>section]:px-5 [&>section]:py-4"`; group labels
use the group-label role; errors/questions are tinted callouts (`rounded-lg border bg-danger/10` /
`bg-accent-subtle`). Used by job details (`xl`) and keyboard shortcuts (`md`).
Use a dialog, not a side sheet, for details panels; `sheet` is only the mobile sidebar.

Tuned shadcn parts: `Button` (primary = violet + top sheen + glow on hover; `outline` on
`bg-surface`; `ghost` is muted text until hover; `link` uses `text-accent-text`; sizes `xs` 24 ·
`sm` 28 · default 32 · `lg` 36, `icon*` to match), `Badge` (`accent` variant added; `secondary`
is muted), `Input`/`Textarea`/`Select`/`InputGroup` (`bg-subtle`, border brightens on hover, violet
focus ring), `Tabs` (default = segmented on `bg-subtle`, active `bg-elevated`; `variant="line"`
has a violet underline that lands on a `border-b` wrapper around the list), `Table` (see DataTable), `Skeleton` (shimmer), dialogs `rounded-xl`.

Toasts: `toast()` from `svelte-sonner`; `<Toaster />` is mounted in the root layout.

## App shell (`$lib/widgets/app-shell`)
- Sidebar (shadcn `sidebar`, `collapsible="icon"`, state in the `sidebar_state` cookie, read on
  the server so there's no flash). Items come from `$lib/shared/config/nav.ts` (`sidebar: true`).
  The active item gets `bg-elevated` + a 2px violet left bar. Clip picker/Editor/Publish highlight
  Queue. Footer: avatar menu (Account, Sign out).
- Main is `max-w-5xl`; a page that puts `data-full-width` on its root (the editor) gets full width.
- Top bar: breadcrumbs (`crumbsFor()` in `nav.ts`), `TopbarActions` slot, search button (⌘K).
- Loading bar: a thin `bg-info` pulse pinned to the top while a navigation is in flight
  (`navigating.to`), so slow server loads (e.g. the Clip Picker presigning URLs) show the click landed.
- Command palette (⌘/Ctrl+K): every nav route, "New job", "Open settings".
- Shortcuts, defined only in `$lib/shared/config/shortcuts.ts`: ⌘K palette · ⌘B sidebar ·
  `?` shortcut dialog · `G` then `H/Q/C/B/S` → Home/Queue/Calendar/Brand memory/Settings.
  Page-scoped entries (`page: '/queue'`) are handled by that page but listed here so the dialog
  shows them: Queue `J`/`K`/`Enter`/`Backspace` (`queueKeys`); Clip picker `J`/`K` move, `X` select (`pickerKeys`); Editor `Space`, `J`/`K`/`L`, `S` split, `I`/`O` marks, `Backspace` delete, ⌘Z / ⇧⌘Z, hold `V` to talk to the agent (handled by the agent chat; only with a voice key) (`editorKeys` + `comboOf`). All ignored while typing
  (`isTyping` in `$lib/shared/lib/is-typing.ts`).

## Do / don't
- Do use tokens, the gradient/motion utilities and shared components; check `/dev/ui` first.
- Do keep one primary button per view; everything else is `outline`, `ghost` or `secondary`.
- Do give empty states real copy that says what to do next.
- Do use `bg-abstract` for atmosphere (page hero, empty state, dropzone, login), one per view.
- Don't use raw hex, hand-written gradients, gradient text, glass/blur, illustrations or literal
  imagery as decoration.
- Don't animate anything idle (besides the processing pulse and skeleton shimmer); keep
  transitions at 150-200ms.
- Don't use mono for labels, all-caps, eyebrow labels or "→" on buttons.
