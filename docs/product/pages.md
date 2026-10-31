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
| `/onboarding` | Onboarding | 9 steps: AI keys, basics, audience, content, voice, visual, publishing defaults, connect YouTube (optional), review | `brand_profile`, `brand_rules` (source=onboarding), `user_keys_public`, `platform_connections_public` | Save per step (refresh resumes), logo upload (R2), review + edit generated rules, "Looks right" → Home (`docs/brand-memory.md`) |
| `/` | Home | Overview + next steps | `posts`, `post_metrics`, `change_log`, `platform_connections_public`, `recommendations` | Hero header on `bg-abstract` with CTA **Generate clips** (primary, → `/queue`). **Recommended long-form videos** section right below the stat cards (or the Get started row): saved batch from brand memory (no region/language asked) as a `Card` grid, centered **Get recommendations** card when never fetched, **Get new recommendations** (top right) replaces it; action `recommend`. With posts: stat cards (clips posted, total views, average score), rating nudge for surprising 7d scores, "What we learned" cards, chart cards: views over time, posts per week, top clips, score distribution. No posts: a 3-step "upload → pick clips → publish" card row (`docs/performance.md`) |
| `/queue` | Queue | Ingestion jobs | `jobs` | Upload (presigned R2) with optional request, Linear-style list (title, copy job ID on hover, step + progress, clip count, duration, added, status, icon actions; on phones the row actions move into the details dialog), details dialog (job ID + copy, progress, error, question, steps, transcript in 5-second paragraphs with search + copy), actions per state (`docs/queue.md`), J/K/Enter/Backspace, 3s polling. Empty queue: a plain `EmptyState` (`backdrop={false}`) since the dropzone already carries the `bg-abstract` |
| `/clips/[jobId]` | Clip Picker | Review clips of a finished job, with reasons | `clips`, `clip_feedback`, `jobs` | Card grid best-ranked first (thumbnail, hook, duration, "Score N" badge, reason badges, transcript excerpt, Select / Reject buttons); the focused card plays in the sticky preview from the clip start, with a "Why this clip" card (summary + per-score bars). `J`/`K` move, `X` / Select toggle select (= approve), Reject with a reason chip (Off-brand, Boring, Too long, Bad cut, Other); each approve/reject appends a `clip_feedback` row. **Proceed with editing** (`?/proceed`) sets `clips.selected`, `jobs.proceeded_at` (the worker's cleanup loop then deletes the source + unselected clip files; otherwise after 48h) and opens `/editor/<first selected clip>`. `/clips` alone redirects to the latest `done` job (empty state if none) |
| `/editor/[clipId]` | Editor | Edit one clip | `clips` (session = selected clips of the job), `timelines`, `edit_events` | Top: toolbar (clip title + render badge, save status, undo/redo, **Render clip**, **Finish all clips** = the one primary button). Left: session clips + render status, + adds another clip (or drag it onto the timeline). Centre: preview (segments from presigned GETs, audio tracks, caption/overlay/blur overlay, CSS crop) + transport (time, back 5s, play/pause, volume, full screen; tooltips show the keys). Bottom: tracks toolbar (split, marks, delete) + lanes with icon headers, violet playhead/selection, pink captions. Right: selection (trim, reorder, delete / track mute, volume) + tabs Format / Audio / Captions / Text, agent chat below (plan 7). Autosave, Render clip = save + render + green check on the clip + jump to the next unresolved clip (statuses poll live), Finish all clips (only clips not yet rendered at their latest edit) → render summary + link to `/publish`. `/editor` alone is an empty state |
| `/publish` | Publish | Post or schedule a rendered clip | `posts`, `platform_connections_public` | Rendered clips not yet posted; template captions (4 platforms), replaced on load by LLM captions (brand memory) in editable fields, post now / schedule to YouTube (private), copy-only for the others (`docs/publishing.md`) |
| `/calendar` | Calendar | Scheduled + posted content | `posts`, `post_metrics`, `baseline_seeds` | Month view (status dots, day popover), table view, filters in the URL, details modal: reschedule, edit caption, cancel, retry, open on YouTube (`docs/publishing.md`) |
| `/brand` | Brand Memory | See/curate rules | `brand_rules`, `brand_profile` | Rules by scope (filter scope/source, pin/edit/archive/restore, add manual), edit profile sections, regenerate rules from profile → accept/reject diff, learned (candidate) list (`docs/brand-memory.md`) |
| `/settings` | Settings | AI providers + platforms | `user_keys_public`, `ai_settings`, `llm_calls`, `platform_connections_public` | AI providers: Groq, Claude, Gemini, Deepgram, Wispr keys ("Only have one key? A Groq key covers everything."); save = validate → encrypt → store; status valid/unverified/invalid, last 4, validated date, Replace/Remove. Default AI provider + transcription provider pickers, Advanced per-task overrides, 7-day usage per provider. Demo accounts see "Using shared demo keys" (`docs/llm.md`). Connected platforms: connect/disconnect YouTube; Instagram, LinkedIn, X coming soon (`docs/publishing.md`) |

Non-product routes: `/login` (Continue with Google), `/auth/callback` (code → session),
`/auth/signout` (POST), `/dev/ui` (dev-only design system review, `docs/design/design-system.md`).
Errors (any route): `routes/+error.svelte`: "Error <status>" + an `EmptyState` with the thrown
message (404 → "This page doesn't exist, or it isn't yours."; unexpected → a generic line) and
**Go home**.

Sidebar: Home, Queue, Calendar, Brand Memory, Settings. Clip Picker, Editor and Publish are
reached from Queue (breadcrumb parent = Queue). Nav config: `$lib/shared/config/nav.ts`.

Clip Picker: `/clips/<jobId>` (Queue `done` rows link here). Editor: `/editor/<clipId>`. The picker's
keys are page-scoped entries in `shortcuts.ts` (`pickerKeys`), so the `?` dialog lists them.

End-to-end flow: Queue `done` row → **Open clips** (picker) → **Proceed with editing** (editor) →
Render clip / **Finish all clips** → **Go to publish** → Post now / Schedule (toast links to **Open
calendar**) → Calendar. Home's **Generate clips** opens the Queue; onboarding's optional step 8
connects YouTube for Publish.
