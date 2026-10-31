---
covers:
  - apps/web/src/routes
last_updated: 2026-10-31
---
# Pages

All are placeholders today: a `PageHeader` + `EmptyState` with real copy, inside the app shell
(`routes/(authed)/(shell)/`). Onboarding is protected but full-screen (`routes/(authed)/onboarding`).
Every route except `/login` and `/auth/*` requires sign-in (`docs/auth-and-keys.md`).
Route → purpose / data / actions.

| Route | Page | Purpose | Data (tables) | Actions |
|---|---|---|---|---|
| `/onboarding` | Onboarding | Capture stated brand rules | `brand_profile`, `brand_rules` (source=stated) | Answer brand questions, paste example posts |
| `/` | Home | Overview + next steps | `posts`, `post_metrics`, `jobs` | CTAs: **Generate clips** (→ upload → `/queue`), **Recommended long-form videos** |
| `/queue` | Queue | Ingestion jobs | `jobs` | Upload (presigned R2) with optional request, Linear-style list, details sheet (steps, error, transcript), actions per state (`docs/queue.md`), J/K/Enter/Backspace, 3s polling |
| `/clips` | Clip Picker | Review clips of a finished job, with reasons | `clips`, `timelines`, `jobs` | Select clips (`clips.selected`), **Proceed with editing** (sets `jobs.proceeded_at` → source + unselected clip files deleted; otherwise after 48h) |
| `/editor` | Editor | Edit one clip | `timelines`, `brand_rules` | Manual timeline edits, agent chat (+ Wispr voice), pick export ratio, save → render |
| `/publish` | Publish | Post or schedule a rendered clip | `posts`, `platform_connections_public` | Rendered clips not yet posted; template captions (4 platforms), post now / schedule to YouTube (private), copy-only for the others (`docs/publishing.md`) |
| `/calendar` | Calendar | Scheduled + posted content | `posts`, `post_metrics`, `baseline_seeds` | Calendar view, table view, details modal, reschedule |
| `/brand` | Brand Memory | See/curate rules | `brand_rules`, `brand_profile` | Accept/reject proposed rules, resolve conflicts, edit stated rules |
| `/settings` | Settings | AI providers + platforms | `user_keys_public`, `ai_settings`, `llm_calls`, `platform_connections_public` | AI providers: Groq, Claude, Gemini, Deepgram, Wispr keys ("Only have one key? A Groq key covers everything."); save = validate → encrypt → store; status valid/unverified/invalid, last 4, validated date, Replace/Remove. Default AI provider + transcription provider pickers, Advanced per-task overrides, 7-day usage per provider. Demo accounts see "Using shared demo keys" (`docs/llm.md`). Connected platforms: connect/disconnect YouTube; Instagram, LinkedIn, X coming soon (`docs/publishing.md`) |

Non-product routes: `/login` (Continue with Google), `/auth/callback` (code → session),
`/auth/signout` (POST), `/dev/ui` (dev-only design system review, `docs/design/design-system.md`).

Sidebar: Home, Queue, Calendar, Brand Memory, Settings. Clip Picker, Editor and Publish are
reached from Queue (breadcrumb parent = Queue). Nav config: `$lib/shared/config/nav.ts`.

Expected params later: `/clips?job=<id>`, `/editor?clip=<id>` (or `[id]` segments — decide when built).
