# Work plan: plan 4 (brand memory + onboarding)

## Phase H: data model + retrieval
- Migration `20261101100000_p4_brand_memory.sql` (adapt, don't duplicate):
  - `rule_source` += onboarding, edits, performance, manual. `rule_status` += candidate, pinned,
    archived. Old values (stated/learned/proposed/rejected) stay in the enum as legacy, unused.
  - New enum `rule_scope` (clip_selection | copy | captions | editing | all).
  - `brand_rules` += `scope` (default all), `evidence_count` (default 0), `updated_at`. Rule text
    stays in the existing `rule` column. Index (user_id, status).
  - `brand_profile` += `onboarding_step` (default 1), `onboarding_completed_at`. Profile fields live
    in `answers` jsonb (typed by zod `BrandProfile`), example posts in `example_posts`.
- `$lib/entities/brand`: `model.ts` (enums, `BrandProfile` zod with per-field `.catch`, row
  mapping, curated fonts), `memory.ts` (`buildMemoryContext`, pure), `memory.test.ts`.
- Docs: brand-memory.md (scope → fields table, statuses/sources), data-model.md.

## Phase I: onboarding + Brand Memory page + gating
- `$lib/server/brand.ts`: load/save profile, `generateStatedRules` (task `stated_rules`, via
  `generateJSON`), shared by onboarding and /brand.
- Key actions extracted from settings into `$lib/server/keys.ts` (`keyActions`) so onboarding
  step 1 reuses `ApiKeyRow` as-is.
- `$lib/shared/ui/chips-input` (topics/words/hashtags), `$lib/features/brand-profile`
  (`ProfileSection` = the fields of one section; used by onboarding steps and /brand).
- Onboarding (`(authed)/onboarding`): 8 steps, progress bar, `?/profile` saves the step patch +
  next step; refresh resumes at `onboarding_step`. Step 6 logo: `?/logo` presigns PUT to
  `brand/{user_id}/logo.<ext>`. Step 8: `?/generate` → candidate rows (source onboarding), editable
  list, `?/finish` → active rules + `onboarding_completed_at` → Home. Skip on steps 3, 6, 7.
- /brand: profile sections (edit + save), "Regenerate rules from profile" (RequiresAI llm) →
  diff (add/remove checkboxes) → apply accepted only. Rules grouped by scope with filters
  (scope, source, show archived); pin/edit/archive/restore/add (manual). "Learned from you" list
  + empty state. `ConflictCard` in entities/brand, shown in /dev/ui.
- Gating: shell checks `brand_profile.onboarding_completed_at`; onboarding redirects completed
  users to /. Dev login sets `onboarding_completed_at` (test updated).
- Verify with dev login (own email `dev-brand@clip-studio.test` in worktree .env so the shared
  test user isn't touched); real-key runs (Claude, Groq-only) → Needs human.
