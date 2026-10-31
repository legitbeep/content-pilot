# Phase C + D: UI foundation (Linear-style) and Supabase auth

Read docs/INDEX.md first, then only the docs it lists for web/UI and auth.
Use plan mode: show me the token plan, component list, and file changes before writing.
Do not build product features. Pages stay placeholders, but inside the real app shell.

## Phase C: Design system

### Direction
Linear-style product UI: quiet, dense, fast, keyboard-first. Content is the loudest
thing on screen. Use 1px borders and background steps for hierarchy, not shadows.
No gradients or glassmorphism, no decorative illustrations, and no motion except as a
response to user actions (open, expand, confirm), all honoring prefers-reduced-motion.
Dark theme only for now (the `dark` class is the default; structure tokens so a light
theme can be added later).

### Tokens (CSS variables in app.css, mapped into the shadcn-svelte theme)
- --bg-canvas      #101114  app background
- --bg-surface     #17181C  sidebar, panels, cards
- --bg-elevated    #1F2026  popovers, modals, hover rows
- --border         #2A2B32  default 1px border
- --border-strong  #3A3B44  focused/active containers
- --text           #E8E8EC  primary text
- --text-muted     #8B8C96  secondary text, metadata
- --accent         #F5C842  signal yellow: primary buttons, focus ring, active nav,
                            playhead, selection
- --accent-fg      #1A1500  text on yellow
- --success #4CC38A, --danger #F2555A, --info #5E9EFF, --warning = accent
Yellow budget: at most one primary button per view, plus focus/active states. Never
use yellow for large fills, body text, or decoration.

### Type
- UI font: Hanken Grotesk (self-hosted via @fontsource), weights 400/500/600 only
- Mono: JetBrains Mono, ONLY for timecodes, durations, and IDs (not for labels)
- Scale: 12 / 13 (base UI) / 14 / 16 / 20 / 24. Sentence case everywhere.
  No all-caps labels, no eyebrow labels above headings, no arrows appended to buttons.
- Radius by hierarchy: 4px inputs/badges, 6px buttons, 8px panels/modals.

### Setup
- Tailwind CSS v4 + shadcn-svelte (follow the current shadcn-svelte docs for SvelteKit
  and Tailwind v4; verify the CLI commands before running them)
- Icons: @lucide/svelte, 16px default, 1.5 stroke
- Toasts: svelte-sonner (via the shadcn-svelte sonner component)
- Add shadcn components: button, input, textarea, label, dialog, sheet, dropdown-menu,
  command, tooltip, tabs, table, badge, select, switch, slider, separator, skeleton,
  avatar, scroll-area, popover, calendar, sonner

### App shell
- Left sidebar (collapsible to icons, remembers state): Home, Queue, Calendar,
  Brand Memory, Settings. Editor and Clip Picker are reached from Queue, not the sidebar.
  Active item: --bg-elevated background + 2px yellow left indicator.
  Bottom: user avatar menu (account, sign out).
- Top bar: breadcrumbs + page-level actions on the right.
- Cmd/Ctrl+K command palette: navigate to any page, "New job", "Open settings".
- Keyboard shortcuts: G then H/Q/C/B/S for navigation, ? opens a shortcut sheet.
  Document them in one place ($lib/shared/config/shortcuts.ts).

### Shared components (FSD: shared/ui)
- PageHeader (title, description, actions slot)
- EmptyState (icon, one-line explanation, one primary action), with real copy, e.g.
  Queue: "No videos yet. Upload a long video to find clips." [Upload video]
- StatusBadge for job states: pending (muted), processing (info + subtle pulse),
  done (success), stopped (muted, strikethrough icon), failed (danger),
  needs_input (accent)
- Kbd (keyboard hint chip)
- Timecode (mono, tabular numbers, e.g. 01:23.4)
- DataTable wrapper (sortable headers, row hover, empty state), used later by the
  calendar table view

### Review page
Create /dev/ui (dev only) showing every token swatch, type scale, and component in
every state, so I can review the system in one place.

### Docs + context
- docs/design/design-system.md: tokens, type, radius, yellow budget, component
  inventory, do/don't list. Add it to INDEX.md.
- .claude/rules/ui.md (paths: apps/web/src/**/*.svelte): use tokens, never raw hex;
  use shared components before creating new ones; sentence case; no shadows.
- .claude/skills/add-ui-component/SKILL.md: create in shared/ui, add to /dev/ui,
  update design-system.md, run pnpm check.

## Phase D: Supabase auth wiring (Google only)

- Use @supabase/ssr with hooks.server.ts, typed locals (supabase, safeGetSession),
  and the +layout.server/+layout.ts pattern from the current Supabase SvelteKit docs.
- /login: centered, minimal page with app name, one-line description,
  "Continue with Google" button. Nothing else.
- /auth/callback route that exchanges the code for a session.
- Protect every app route; redirect unauthenticated users to /login.
- First-login hook: if the profile has no brand_profile, route to /onboarding
  (placeholder page).
- Use EXACTLY these env var names in .env.example and env.md:
    apps/web/.env:
      PUBLIC_SUPABASE_URL=
      PUBLIC_SUPABASE_PUBLISHABLE_KEY=
      SUPABASE_SECRET_KEY=          # server only, never imported in client code
      ENCRYPTION_KEY=               # base64, 32 bytes
    apps/worker/.env:
      SUPABASE_URL=
      SUPABASE_SECRET_KEY=
      ENCRYPTION_KEY=               # same value as web
- Add a guard (lint rule or check script) that fails if SUPABASE_SECRET_KEY is
  imported anywhere under a client-reachable module.
- Update docs/auth-and-keys.md and docs/env.md.

## Acceptance
- pnpm check passes (including the docs check)
- /dev/ui renders all tokens and components
- Unauthenticated visit to / redirects to /login
- Every placeholder page renders inside the shell with its empty state
- Final report: what I need to configure in Supabase/Google, listing every env var
  and where it goes. Do NOT run supabase link or db push; I'll do that.
