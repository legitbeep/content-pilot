---
covers:
  - apps/web/src/routes
last_updated: 2026-11-01
---
# Pages

Pages not yet built are placeholders: a `PageHeader` + `EmptyState` with real copy, inside the app shell
(`routes/(authed)/(shell)/`). Onboarding is protected but full-screen (`routes/(authed)/onboarding`).
Every route except `/login` and `/auth/*` requires sign-in (`docs/auth-and-keys.md`).
Route → purpose / data / actions.

| Route | Page | Purpose | Data (tables) | Actions |
|---|---|---|---|---|
| `/onboarding` | Onboarding | 8 steps: AI keys, basics, audience, content, voice, visual, publishing defaults, review | `brand_profile`, `brand_rules` (source=onboarding), `user_keys_public` | Save per step (refresh resumes), logo upload (R2), review + edit generated rules, "Looks right" → Home (`docs/brand-memory.md`) |
| `/` | Home | Overview + next steps | `posts`, `post_metrics`, `change_log`, `platform_connections_public` | CTAs: **Generate clips** (→ `/queue`), **Recommended long-form videos** (sheet, region, LLM picks). Rating nudge for surprising 7d scores, "What we learned" cards, charts: views over time, posts per week, top clips, score distribution (`docs/performance.md`) |
| `/queue` | Queue | Ingestion jobs | `jobs` | Upload (presigned R2) with optional request, Linear-style list, details sheet (steps, error, transcript), actions per state (`docs/queue.md`), J/K/Enter/Backspace, 3s polling |
| `/clips/[jobId]` | Clip Picker | Review clips of a finished job, with reasons | `clips`, `clip_feedback`, `jobs` | Linear list best-ranked first (thumbnail, duration, hook, reasons, transcript excerpt, small muted score); the focused row plays in the preview from the clip start. each row shows "Score: N/100"; the preview has the clip's Summary. `J`/`K` move, `X` / ✓ toggle select (= approve), ✗ reject with a reason chip (Off-brand, Boring, Too long, Bad cut, Other); each approve/reject appends a `clip_feedback` row. **Proceed with editing** (`?/proceed`) sets `clips.selected`, `jobs.proceeded_at` (the worker's cleanup loop then deletes the source + unselected clip files; otherwise after 48h) and opens `/editor/<first selected clip>`. `/clips` alone redirects to the latest `done` job (empty state if none) |
| `/editor/[clipId]` | Editor | Edit one clip | `clips` (session = selected clips of the job), `timelines`, `edit_events` | Left: session clips + render status, "Add here" merges another clip. Centre: preview (segments from presigned GETs, audio tracks, caption/overlay/blur overlay, CSS crop). Bottom: tracks with yellow playhead, marks. Right: properties (trim, reorder, delete, aspect, crop, audio, ducking, uploads, captions, text, blur) + agent chat slot (plan 7). Autosave, undo/redo, Save = render, Finish all clips → render summary + link to `/publish`. `/editor` alone is an empty state |
| `/publish` | Publish | Post or schedule a rendered clip | `posts`, `platform_connections_public` | Rendered clips not yet posted; template captions (4 platforms) or **Generate captions** (LLM, brand memory), post now / schedule to YouTube (private), copy-only for the others (`docs/publishing.md`) |
| `/calendar` | Calendar | Scheduled + posted content | `posts`, `post_metrics`, `baseline_seeds` | Month view (status dots, day popover), table view, filters in the URL, details modal: reschedule, edit caption, cancel, retry, open on YouTube (`docs/publishing.md`) |
| `/brand` | Brand Memory | See/curate rules | `brand_rules`, `brand_profile` | Rules by scope (filter scope/source, pin/edit/archive/restore, add manual), edit profile sections, regenerate rules from profile → accept/reject diff, learned (candidate) list (`docs/brand-memory.md`) |
| `/settings` | Settings | AI providers + platforms | `user_keys_public`, `ai_settings`, `llm_calls`, `platform_connections_public` | AI providers: Groq, Claude, Gemini, Deepgram, Wispr keys ("Only have one key? A Groq key covers everything."); save = validate → encrypt → store; status valid/unverified/invalid, last 4, validated date, Replace/Remove. Default AI provider + transcription provider pickers, Advanced per-task overrides, 7-day usage per provider. Demo accounts see "Using shared demo keys" (`docs/llm.md`). Connected platforms: connect/disconnect YouTube; Instagram, LinkedIn, X coming soon (`docs/publishing.md`) |

Non-product routes: `/login` (Continue with Google), `/auth/callback` (code → session),
`/auth/signout` (POST), `/dev/ui` (dev-only design system review, `docs/design/design-system.md`).

Sidebar: Home, Queue, Calendar, Brand Memory, Settings. Clip Picker, Editor and Publish are
reached from Queue (breadcrumb parent = Queue). Nav config: `$lib/shared/config/nav.ts`.

Clip Picker: `/clips/<jobId>` (Queue `done` rows link here). Editor: `/editor/<clipId>`. The picker's
keys are page-local (not in `shortcuts.ts`, which plan 7 owns during wave 2).
