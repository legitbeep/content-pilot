# Phases H–I: Onboarding + Brand Memory

Read CLAUDE.md, then docs/INDEX.md, and open only the docs it lists for: brand-memory,
data-model, auth-and-keys, product/pages, design-system. Use plan mode and show the plan
first. Commit after each phase. Use existing skills and keep docs in sync.

## Phase H: Shared LLM client + memory data model

1. Server-side Anthropic client in apps/web/src/lib/server/llm/:
   - Uses the signed-in user's decrypted Anthropic key (never ours).
   - Model from env ANTHROPIC_MODEL with a sensible default; verify current model
     names in Anthropic's docs.
   - Helper `generateJSON(schema, prompt)`: asks for JSON only, strips code fences,
     validates with zod, retries once with the validation error, then throws a
     user-readable error.
   - Clear errors for invalid key, rate limit, and overloaded API.
   - Document in docs/llm.md (new; add to INDEX.md). Note that the worker will get
     a Python twin in the next prompt with the same JSON contract.
2. Migration (use add-migration) so brand memory supports:
   - brand_profile: structured onboarding answers (name, one-liner, niche, language
     incl. Hinglish, audience, core_topics[], off_limits_topics[], banned_words[],
     tone {casual_formal, funny_serious, bold_humble} 0–100, example_posts[],
     disliked_posts[], logo_path, colors[], caption_font, default_cta,
     default_hashtags[], posting_goal, onboarding_step, onboarding_completed_at).
   - brand_rules: id, text, scope (clip_selection | copy | captions | editing | all),
     source (onboarding | edits | performance | manual), status (candidate | active
     | pinned | archived), evidence_count, evidence jsonb (refs to clips/posts/edits),
     created_at, updated_at. RLS: owner only.
   - Adapt the existing tables rather than duplicating them.
3. Memory retrieval, pure and tested: `buildMemoryContext(profile, rules,
   { scope, topics? })` returns a compact text block for prompts:
   - Includes profile fields relevant to the scope, plus active and pinned rules
     for that scope or "all". Pinned rules always included; candidates never.
   - When topics are given, rank rules mentioning those topics first.
   - Hard cap (~1,500 tokens); drop lowest-evidence rules first.
   - Document the scope -> fields mapping in docs/brand-memory.md. This function is
     what extraction, copy and the editor agent will all call.

## Phase I: Onboarding flow + Brand Memory page

1. Onboarding (route group outside the shell; steps with a progress indicator; save
   after every step so a refresh resumes where the user left off):
   1. API keys (reuse the Settings component; can't continue without valid
      Anthropic + Deepgram keys)
   2. Basics: brand name, one-line description, niche, content language
   3. Audience: who they are, what they care about
   4. Content: core topics (chips, max 5), off-limits topics, banned words/phrases
   5. Voice: three tone sliders + paste 3–5 example posts as text (title, caption or
      script) + optional 1–2 posts they disliked
   6. Visual: logo upload (presigned upload to R2 at brand/{user_id}/logo.*),
      brand colors, caption font (short curated list)
   7. Publishing defaults: CTA, hashtags, posting goal (e.g. 3 per week)
   8. Review: the LLM turns all answers + examples into stated rules (source:
      onboarding, status: active, each with a scope). Show "Here's what we
      understood about your brand" as an editable list: edit text, change scope,
      delete, add. "Looks right" saves and opens Home.
   Steps 3, 6 and 7 have "Skip for now". Copy follows design-system.md: plain,
   sentence case, specific.
2. Brand Memory page (in the shell):
   - "You told us": the profile, editable in the same sections as onboarding.
     Editing the profile does NOT silently rewrite rules; offer "Regenerate rules
     from profile" which shows a diff to accept or reject.
   - "Rules": list grouped by scope. Each rule shows text, source badge, evidence
     count, status. Actions: pin, edit, archive. Add a rule manually (source:
     manual). Filter by scope and source.
   - "Learned from you": candidates and edit-learned rules. Empty state for now:
     "Rules appear here as you edit clips and posts perform."
   - A ConflictCard component (stated rule vs. learned pattern, with "Keep mine" /
     "Update rule" actions) built and shown in /dev/ui with sample data; it gets
     wired up in the editor-learning prompt.
3. Gating: signed-in users without onboarding_completed_at go to /onboarding;
   completed users visiting /onboarding go to Home.

## Acceptance
- pnpm check and pnpm test pass (including tests for buildMemoryContext: scope
  filtering, pinned always included, candidates excluded, token cap)
- New Google account: onboarding -> refresh mid-way resumes -> review shows
  sensible rules from my answers -> Home
- Brand Memory page shows the profile and rules; pin/edit/archive/add work
- "Regenerate rules from profile" shows a diff and only applies accepted changes
- Final report: docs changed, anything unverified, and 2–3 example outputs of
  buildMemoryContext for different scopes so I can sanity-check the prompt text
