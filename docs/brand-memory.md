---
covers:
  - apps/worker/pipeline/brand_fit.py
  - apps/web/src/lib/entities/brand
  - apps/web/src/lib/features/brand-profile
  - apps/web/src/lib/features/brand-rules
  - apps/web/src/lib/server/brand.ts
  - apps/web/src/lib/server/agent/learn.ts
  - apps/web/src/routes/api/editor/learn
  - apps/web/src/routes/(authed)/onboarding
  - apps/web/src/routes/(authed)/(shell)/brand
  - supabase/migrations
last_updated: 2026-11-01
---
# Brand memory

Tables: `brand_profile` (onboarding answers), `brand_rules` (one row per rule). Owner-only RLS.

## Profile (`brand_profile`)
Zod `BrandProfile` in `$lib/entities/brand/model.ts` (every field falls back to a default, so
partial rows parse). Stored in `answers` jsonb, except `example_posts` (its own jsonb column).
Read with `profileFromRow(row)`, write with `profileToRow(profile)`.

| Field | Type |
|---|---|
| name, one_liner, niche, language (free text; English, Hindi, Hinglish… suggested), audience | string |
| core_topics (max 5), off_limits_topics, banned_words, default_hashtags | string[] |
| tone | `{ casual_formal, funny_serious, bold_humble }` 0-100 (0 = first word) |
| example_posts (3-5), disliked_posts (0-2) | string[] (title, caption or script as text) |
| logo_path | `brand/{user_id}/logo.{png,jpg,webp}` in R2, or null |
| colors (max 5, `#rrggbb`), caption_font (curated `CAPTION_FONTS`), default_cta | |
| posting_goal | posts per week, or null |

Columns: `onboarding_step` (1-8, where a refresh resumes), `onboarding_completed_at` (the gate).

## Rules (`brand_rules`)
Text is in the `rule` column. `scope`: clip_selection | copy | captions | editing | all.
`evidence_count` + `evidence` jsonb (refs to clips/posts/edits). `updated_at`.

| `source` | Made by | Initial `status` |
|---|---|---|
| onboarding | onboarding review / "Regenerate rules from profile" (task `stated_rules`) | active |
| manual | "Add rule" on the Brand Memory page | active |
| edits | edit-pattern analyzer (plan 7) | candidate |
| performance | performance loop (plan 9) | candidate |

`status`: candidate (proposed, never used in prompts) → active → pinned (always in prompts) /
archived (hidden, restorable). The legacy enum values `stated`, `learned`, `proposed`, `rejected`
from the first migration are no longer written.

## Onboarding (`routes/(authed)/onboarding`)
Full-screen, 8 steps with a progress bar: 1 AI providers (`ApiKeyRow` from Settings; Continue needs
an LLM + transcription capability, or demo; the server re-checks with `requireAIKeys('both')`) ·
2 Basics (name required) · 3 Audience · 4 Content · 5 Voice · 6 Visual · 7 Publishing defaults ·
8 Review. Steps 3, 6, 7 have "Skip for now". Each Continue posts `?/profile` (`step` + JSON
`patch` of that section's fields, `sectionFields` in `features/brand-profile`) and saves
`onboarding_step = step + 1`, so a refresh resumes there. Back only moves locally.
- Logo: `?/logo` presigns a PUT to `brand/{user_id}/logo.{png,jpg,webp}` (≤2 MB); the browser PUTs
  to R2 and the step saves `logo_path`. Shown back through a presigned GET (`presignGet`).
- Review: entering step 8 calls `?/generate` (task `stated_rules`, `generateStatedRules` in
  `$lib/server/brand.ts`); drafts are saved as `candidate` + `onboarding` rows so a refresh keeps
  them. Editable list (text, scope, delete, add; `DraftRuleList`). "Looks right" (`?/finish`)
  replaces the candidates with `active` rules, sets `onboarding_completed_at` (+
  `profiles.onboarded_at`) and redirects to Home. AI errors show their message inline.
- Gate: the shell layout sends users without `onboarding_completed_at` to `/onboarding`;
  onboarding sends completed users to `/`. Dev login sets it for its test user. TEMP:
  `SKIP_ONBOARDING=true` skips the gate (`docs/env.md`), removed in plan10.

## Brand Memory page (`routes/(authed)/(shell)/brand`)
Tabs: **Rules** (grouped by scope; filter by scope and source, "Show archived"; per rule
pin/unpin, edit text + scope, archive/restore via `?/rule`; add a manual rule), **You told us**
(the same `ProfileSection`s as onboarding, each saved with `?/profile`; saving never touches
rules), **Learned from you** (candidates: conflict cards + tick-box review, see Learned rules;
empty state "Rules appear here as you edit clips and posts perform.").
"Regenerate rules from profile" (`<RequiresAI need="llm">`, `?/regenerate`) runs `stated_rules`
and returns a diff without saving: rules to add (text not already present) and `onboarding`
`active` rules to archive (not in the new set; pinned and manual rules are never proposed). Adds
are ticked by default, archives not (`RuleReview`, shared with the learned review);
`?/applyRegenerate` applies only the ticked ones.

## buildMemoryContext (`$lib/entities/brand/memory.ts`)
`buildMemoryContext(profile, rules, { scope, topics?, maxTokens? })` → text block for prompts.
Pure; extraction, copy, captions and the editor agent all call it.
- Profile fields for the scope (below), then `Brand rules:` with active + pinned rules whose
  scope is `scope` or `all` (`scope: 'all'` → every rule). Candidates and archived never.
- Order: pinned, then rules containing any of `topics` (case-insensitive), then most evidence.
- Cap `MEMORY_TOKEN_CAP` = 1,500 tokens (~4 chars/token): drop the lowest-evidence non-pinned
  rule until it fits. Pinned rules are always kept. Example posts are clipped to 400 chars.

| Scope | Profile fields |
|---|---|
| clip_selection | brand (name + one-liner), niche, language, audience, core topics, off-limits, tone |
| copy | clip_selection's + banned words, example + disliked posts, CTA, hashtags |
| captions | brand, language, banned words, tone, caption font, colors |
| editing | brand, tone, caption font, colors, has-logo |
| all | everything (incl. posting goal) |

No worker (Python) mirror yet; a worker step that needs it should port `memory.ts` and reuse
`memory.test.ts`'s cases.

## Learned rules
Learners **never activate a rule** (CLAUDE.md hard rule 4): they only insert or update
`candidate` rows; only the user's tick on /brand makes one `active`.
- **Edits (plan 7, `$lib/server/agent/learn.ts`)**: `POST /api/editor/learn` runs after every
  editor save (only when 25+ `edit_events` arrived since the user's `learn_cursor`) and after
  "Finish all clips" (`force`). It claims the run by moving `learn_cursor.last_event_at`
  (compare-and-set; moved back if the AI call fails), drops undone edits and trivial ones
  (`meaningful`: undo/redo, splits, trims within 1s of the clip's original range, caption typo
  fixes by edit distance), and sends the rest plus `clip_feedback` (plan 5; tolerated if missing)
  and every rule (as `r1…` with status) to task `learn_rules`. The model returns
  `{patterns: [{rule, scope, evidence: ['e1', 'f2'], same_as, contradicts}]}`.
- Caption edits (plan 9) are `edit_events` with `op = 'caption_edit'`, `args = {platform, before,
  after}`; read like any other event.
- `applyPatterns` (pure, tested): match by `same_as` or identical text. Candidate match → append
  evidence, `evidence_count` + the number of **new clips** (posts / items without a clip count
  once each). Active/pinned match → nothing (already a rule). Archived match → nothing (dismissed
  rules are never re-proposed). No match → new `candidate`, `source = 'edits'`, count = distinct
  clips. Evidence items: `{kind: 'edit' | 'caption' | 'feedback' | 'proposal', clip_id, event_id |
  feedback_id, …}`; plan 9 writes `{kind: 'performance', post_id, feature, verdict}`.
- **Ready**: `evidence_count >= READY_AT` (3, `$lib/entities/brand`). Crossing it returns the rule
  in `ready` and the editor toasts "New rule ready to review: …" with a Review link
  (`/brand?tab=learned`). Still a candidate.
- The agent's `propose_memory_update` → `POST /api/editor/propose` → `proposeRule`: the same
  `applyPatterns` (identical-text match, evidence `{kind: 'proposal', clip_id, text}`), no AI call.
- **Review** (/brand "Learned from you", `?tab=learned` opens it): `RuleReview` (the same tick-box
  component as "Regenerate rules from profile", `$lib/features/brand-rules`), sections "Ready to
  review" (highlighted, ticked by default) and "Still learning" (unticked), for every candidate of
  any source (edits and performance). "Use selected rules" → ticked become `active`; "Dismiss
  unticked" → `archived`. Action `?/learned` (`op=apply`, `activate`/`dismiss` ids; only rows still
  `candidate`).
- Seed: `pnpm seed:agent` / `pnpm seed:agent:clean` (`apps/worker/seeds/agent.py`).

## Conflicts
`applyPatterns` sets `conflicts_with = <rule id>` when the model says a pattern contradicts an
**active or pinned** rule, and the editor toasts "Your edits go against "…". Pick which to keep."
On /brand such candidates show as `ConflictCard` (stated vs learned, "seen N times") above the
review: **Keep mine** (`?/learned op=keep`) archives the candidate; **Update rule** (`op=update`)
archives the stated rule and activates the candidate. Nothing is ever overridden without one of
these clicks.

## Who reads it
- `brand_fit` step: profile + rules → pass or `NeedsInput` question.
- `extract_clips`: rules guide clip choice and reasons (scope clip_selection).
- Editor agent: rules in context; may only propose (`docs/agent.md`).
- Clip selection: unselected `clips` rows are a negative signal for edit-pattern detection.
