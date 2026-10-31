# Plan 4: Onboarding + Brand Memory

Wave 1 (parallel with plans 6 and 8). Branch `feat/brand`, dev port 5173.
Read plans/parallel-rules.md, CLAUDE.md, docs/INDEX.md, then only: brand-memory, llm,
data-model, auth-and-keys, product/pages, design-system. Plan mode first. Commit
after each phase. Use existing skills and keep docs in sync.

All AI calls go through the LLM adapter from plan-llm (`generateJSON({ userId, task,
schema, system, prompt })`). Never import a provider SDK.

## Phase H: Memory data model + retrieval

1. Migration (use add-migration) so brand memory supports:
   - brand_profile: structured onboarding answers (name, one-liner, niche, language
     incl. Hinglish, audience, core_topics[], off_limits_topics[], banned_words[],
     tone {casual_formal, funny_serious, bold_humble} 0-100, example_posts[],
     disliked_posts[], logo_path, colors[], caption_font, default_cta,
     default_hashtags[], posting_goal, onboarding_step, onboarding_completed_at).
   - brand_rules: id, text, scope (clip_selection | copy | captions | editing | all),
     source (onboarding | edits | performance | manual), status (candidate | active |
     pinned | archived), evidence_count, evidence jsonb (refs to clips/posts/edits),
     created_at, updated_at. RLS: owner only.
   - Adapt the existing tables rather than duplicating them.
2. Memory retrieval, pure and tested: `buildMemoryContext(profile, rules,
   { scope, topics? })` returns a compact text block for prompts:
   - Includes profile fields relevant to the scope, plus active and pinned rules for
     that scope or "all". Pinned rules always included; candidates never.
   - When topics are given, rank rules mentioning those topics first.
   - Hard cap (~1,500 tokens); drop lowest-evidence rules first.
   - Document the scope -> fields mapping in docs/brand-memory.md. Extraction, copy
     and the editor agent all call this.

## Phase I: Onboarding flow + Brand Memory page

1. Onboarding (route group outside the shell; steps with a progress indicator; save
   after every step so a refresh resumes where the user left off):
   1. AI providers: reuse the Settings component; can't continue without at least
      one LLM key and one transcription key (per docs/llm.md)
   2. Basics: brand name, one-line description, niche, content language
   3. Audience: who they are, what they care about
   4. Content: core topics (chips, max 5), off-limits topics, banned words/phrases
   5. Voice: three tone sliders + paste 3-5 example posts as text (title, caption or
      script) + optional 1-2 posts they disliked
   6. Visual: logo upload (presigned upload to R2 at brand/{user_id}/logo.*), brand
      colors, caption font (short curated list)
   7. Publishing defaults: CTA, hashtags, posting goal (e.g. 3 per week)
   8. Review: task `stated_rules` turns all answers + examples into stated rules
      (source: onboarding, status: active, each with a scope). Show "Here's what we
      understood about your brand" as an editable list: edit text, change scope,
      delete, add. "Looks right" saves and opens Home.
   Steps 3, 6 and 7 have "Skip for now". Copy follows design-system.md.
2. Brand Memory page (in the shell):
   - "You told us": the profile, editable in the same sections as onboarding.
     Editing the profile does NOT silently rewrite rules; "Regenerate rules from
     profile" shows a diff to accept or reject.
   - "Rules": grouped by scope. Each shows text, source badge, evidence count,
     status. Actions: pin, edit, archive. Add a rule manually (source: manual).
     Filter by scope and source.
   - "Learned from you": empty state for now: "Rules appear here as you edit clips
     and posts perform."
   - A ConflictCard component (stated rule vs. learned pattern, "Keep mine" /
     "Update rule") in /dev/ui with sample data; plan 7 wires it up.
3. Gating: users without onboarding_completed_at go to /onboarding; completed users
   visiting /onboarding go to Home.

## Acceptance

- pnpm check and pnpm test pass (buildMemoryContext: scope filtering, pinned always
  included, candidates excluded, token cap).
- New account: onboarding -> refresh mid-way resumes -> review shows sensible rules
  -> Home. Works with a Claude key, and again with only a Groq key.
- Brand Memory page: pin/edit/archive/add work; "Regenerate rules from profile"
  only applies accepted changes.
- Handoff note includes 2-3 example outputs of buildMemoryContext for different
  scopes.
