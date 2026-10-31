# Handoff: plan 4 (brand memory + onboarding), branch feat/brand

## Built
- **Data model** (`supabase/migrations/20261101100000_p4_brand_memory.sql`, applied to the shared
  DB, idempotent, re-run OK). Adapts the existing tables instead of duplicating them:
  - `rule_source` += onboarding, edits, performance, manual; `rule_status` += candidate, pinned,
    archived. Legacy values (stated/learned/proposed/rejected) stay in the enums, unused.
  - New enum `rule_scope`. `brand_rules` += `scope` (default all), `evidence_count`, `updated_at`;
    rule text stays in the existing `rule` column. Index `brand_rules_user_status_idx`.
  - `brand_profile` += `onboarding_step`, `onboarding_completed_at`. Profile fields live in
    `answers` jsonb (zod `BrandProfile`); example posts in the existing `example_posts` column.
- **`buildMemoryContext(profile, rules, { scope, topics?, maxTokens? })`** in
  `$lib/entities/brand` (pure, tested: scope filtering, pinned always kept, candidates/archived
  excluded, topic ranking, 1,500-token cap). The scope → fields table is in docs/brand-memory.md.
- **Onboarding** (`/onboarding`): 8 steps, progress bar, saves every step, a refresh resumes at
  the saved step, Skip on 3/6/7, logo upload to R2 `brand/{user_id}/logo.*`, review step runs
  `stated_rules`, editable list, "Looks right" → Home.
- **Brand Memory** (`/brand`): Rules tab (grouped by scope, scope/source filters, show archived,
  pin/edit/archive/restore, add manual), You told us tab (the same sections, saving never touches
  rules), Learned from you (candidates + empty state), "Regenerate rules from profile"
  (`<RequiresAI need="llm">`) → a tick-box diff where only the ticked changes apply.
- **ConflictCard** (`$lib/entities/brand`), shown in /dev/ui with sample data; plan 7 wires it.
  **ChipsInput** (`$lib/shared/ui/chips-input`), also in /dev/ui.
- **Gate**: the shell checks `brand_profile.onboarding_completed_at`; completed users visiting
  /onboarding go to /. Dev login now also sets `onboarding_completed_at` (test updated).

## Contracts
- `buildMemoryContext` as above (web/TS only; no Python mirror yet. A worker step that needs it
  should port `memory.ts` and reuse `memory.test.ts`'s cases).
- Rule statuses/sources for plans 7/9: write learned rules as `status: 'candidate'`,
  `source: 'edits' | 'performance'`, set `evidence_count` + `evidence`. Use `conflicts_with` and
  `ConflictCard` for conflicts.
- LLM tasks: no new task names. Uses the existing `stated_rules` (smart). The adapter is unchanged.

## Shared files touched (small, additive)
- `$lib/server/keys.ts`: Settings' key save/remove actions moved here as `keyActions` (spread into
  Settings and onboarding). Behaviour unchanged.
- `$lib/server/r2.ts`: added `presignGet` (shares one `presign` helper with `presignPut`).
- `$lib/server/dev-login.ts` + its test; `(shell)/+layout.server.ts` gate.
- `routes/dev/ui/+page.svelte` (2 sections). Docs: brand-memory, data-model, auth-and-keys,
  pages, design-system, architecture, llm (one line).

## Verified locally (dev login, port 5173)
I used my own test user (`DEV_LOGIN_EMAIL=dev-brand@clip-studio.test`, set only in this
worktree's `apps/web/.env`, and added to `DEMO_ALLOWED_EMAILS` there), so the shared dev user was
never touched. Checked: gate redirect, refresh resumes at the right step, every step's save, logo
upload to R2 + preview, the draft list after a refresh, "Looks right" → Home, Brand page
add/pin/edit/archive, validation, apply-diff only applying the ticked items (pinned is never
archived), profile save leaving rules alone, and no console errors. I did not seed rows for
anyone else; I added no seed script because the UI creates everything.

## Needs human
1. **Real rule generation.** The shared demo Gemini key was rate-limited (daily quota), so
   `stated_rules` returned the readable error, which the page showed correctly. To test: sign in
   with Google as a new user → Settings isn't needed; onboarding step 1 → paste a **Claude** key →
   go through the steps → on Review, check the rules make sense → Looks right → Home. Then
   remove the Claude key, add only a **Groq** key, open /brand → "Regenerate rules from profile"
   → tick some changes → Apply selected, and check only those changed.
2. Existing real accounts that only have a placeholder `brand_profile` row (no
   `onboarding_completed_at`) will see onboarding once after merge. That is intended; no backfill.

## Example buildMemoryContext output (profile "Chai Code", 7 rules incl. 1 pinned, 1 candidate)
```
--- scope: clip_selection (topics: ["interview"])
Brand: Chai Code - Coding explained over chai
Niche: web development
Content language: Hinglish
Audience: Students and early-career developers in India who want their first job
Core topics: javascript, careers, interviews
Never cover: politics
Tone (0-100): casual→formal 20, funny→serious 40, bold→humble 60
Brand rules:
- Pick moments with one concrete interview tip.
- Never use the words hustle or 10x.

--- scope: copy
Brand: Chai Code - Coding explained over chai
... (niche, language, audience, topics, never cover)
Never use these words: hustle, 10x
Tone (0-100): casual→formal 20, funny→serious 40, bold→humble 60
Posts they like:
- Tumhara pehla job tumhara last job nahi hai.
- 3 JavaScript concepts jo har interview mein aate hain
Posts they dislike:
- SECRET HACK to get rich with coding!!!
Default call to action: Follow for a new explainer every Tuesday
Default hashtags: #coding
Brand rules:
- Keep copy in casual Hinglish.        (pinned, listed first)
- Never open with a question.
- Never use the words hustle or 10x.

--- scope: editing   (candidate "Use 1:1 crops." is excluded)
Brand: Chai Code - Coding explained over chai
Tone (0-100): casual→formal 20, funny→serious 40, bold→humble 60
Caption font: Inter
Brand colors: #F5C842
Has a logo
Brand rules:
- Cut the first 2 seconds of silence.
- Never use the words hustle or 10x.
```

## Known gaps / risks
- Regenerate diff matches on normalised exact text, so a reworded rule shows up as one add plus
  one archive. The user decides (archives are unticked by default).
- Token count is estimated at about 4 chars per token.
- Accepting or rejecting learned candidates is just pin/archive on the row for now; plan 7 owns
  the real flow and conflicts.
- Caption fonts are names only; the renderer (plan 6) has to map them to font files.
