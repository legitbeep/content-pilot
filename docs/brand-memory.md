---
covers:
  - apps/worker/pipeline/brand_fit.py
  - apps/web/src/lib/entities/brand
  - apps/web/src/lib/features/brand-profile
  - apps/web/src/lib/features/brand-rules
  - apps/web/src/lib/server/brand.ts
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
rules), **Learned from you** (candidates; empty state "Rules appear here as you edit clips and
posts perform.").
"Regenerate rules from profile" (`<RequiresAI need="llm">`, `?/regenerate`) runs `stated_rules`
and returns a diff without saving: rules to add (text not already present) and `onboarding`
`active` rules to archive (not in the new set; pinned and manual rules are never proposed). Adds
are ticked by default, archives not; `?/applyRegenerate` applies only the ticked ones.

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

No worker (Python) mirror: the web stores the clip_selection text on `jobs.memory_snapshot` when
a job is created and the worker reads only that (`docs/pipeline.md`).

## Learned rules
Same kind of edit made 3+ times across clips (e.g. always removing the first 2s) → a `candidate`
rule with `source: edits` and the edits as evidence (plan 7). The performance loop does the same
for repeated high/low scores (`docs/publishing.md`). Accept → `active`; reject → `archived`
(don't re-propose the same rule).

## Conflicts
A candidate that contradicts an active rule gets `conflicts_with = <other rule id>` and is shown
with `ConflictCard` (stated vs learned, "Keep mine" / "Update rule"). Never auto-override.

## Who reads it
- `brand_fit` step: `jobs.memory_snapshot` → pass or `NeedsInput` question; the answer is
  `jobs.user_intent` (job-scoped, never a rule).
- `extract_clips`: `jobs.memory_snapshot` + `user_intent` guide clip choice and reasons.
- Editor agent: rules in context; may only propose (`docs/agent.md`).
- Clip selection: unselected `clips` rows are a negative signal for edit-pattern detection.

### Performance candidates (plan 9)
The checkpoints loop writes `brand_rules` with `source = performance`, `status = candidate`,
`scope = clip_selection` when one feature (`topic:x`, `length:short`, `hook:question`) gets the
same verdict (boost or downgrade) on 3+ posts. `evidence` items are
`{kind: 'performance', post_id, feature, verdict}`; dedupe = an existing candidate with the same
`evidence[0].feature` + verdict (new posts appended, `evidence_count` = items). Accepted, pinned or
archived matches are never touched. It never sets `active`. Details: `docs/performance.md`.
