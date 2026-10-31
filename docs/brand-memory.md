---
covers:
  - apps/worker/pipeline/brand_fit.py
  - apps/web/src/lib/entities/brand
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
Same kind of edit made 3+ times across clips (e.g. always removing the first 2s) → a `candidate`
rule with `source: edits` and the edits as evidence (plan 7). The performance loop does the same
for repeated high/low scores (`docs/publishing.md`). Accept → `active`; reject → `archived`
(don't re-propose the same rule).

## Conflicts
A candidate that contradicts an active rule gets `conflicts_with = <other rule id>` and is shown
with `ConflictCard` (stated vs learned, "Keep mine" / "Update rule"). Never auto-override.

## Who reads it
- `brand_fit` step: profile + rules → pass or `NeedsInput` question.
- `extract_clips`: rules guide clip choice and reasons (scope clip_selection).
- Editor agent: rules in context; may only propose (`docs/agent.md`).
- Clip selection: unselected `clips` rows are a negative signal for edit-pattern detection.
