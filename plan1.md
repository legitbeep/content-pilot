# Kickoff: Clip Studio monorepo (skeleton + AI context system only)

You are setting up a new monorepo for a hackathon product. Your job in this session is
ONLY the skeleton, tooling, docs, and Claude Code context system. Do NOT build product
features. Work in phases, and stop after each phase with a short summary so I can review.
Use plan mode first: show me the full file tree you intend to create before writing files.

## 1. Product context (write this into docs/product/spec.md, condensed)

Content repurposing studio with brand memory. A creator uploads a long video (incl. video
podcasts); the system finds short clips with reasons, the creator edits them, and posts
or schedules them. It learns from edits and from real performance.

Pages: Onboarding (brand questions + example posts), Home (analytics + recommendations +
two CTAs: "Generate clips" / "Recommended long-form videos"), Queue (ingestion jobs),
Clip Picker, Editor, Publish, Calendar (calendar view + table view + details modal),
Brand Memory, Settings (API keys, connected platforms).

Core rules:
- Queue job states: pending | processing | done | stopped | failed. Pending jobs can be
  reordered; processing jobs can be stopped; worker checks for stop between steps.
- Pipeline: transcribe -> NSFW check (hard block) -> brand-fit check (soft, may pause job
  as "needs input") -> clip extraction with reasons -> source video deleted after clips.
- Editor: every edit (manual UI or agent) mutates a TIMELINE JSON. Video is only rendered
  by the worker with FFmpeg on save. The editor agent runs in SvelteKit server routes,
  plans multi-step requests as a todo list, and its tools are pure functions on the
  timeline. It may only PROPOSE memory updates, never write them directly.
- Voice input (Wispr Flow) only in the editor chat; typing always works.
- Brand memory: stated rules (onboarding) vs learned rules (3+ repeated edits). Conflicts
  are surfaced to the user, never silently overridden.
- Publishing: YouTube only for now (posted as private while app is unverified). Captions
  generated for youtube/instagram/linkedin/x; only YouTube auto-posts, others copy-only.
- Scheduler + performance checkpoints at 48h, 7d, 14d, 30d run as a loop in the worker.
  Score = views / creator's median at same checkpoint. Repeated patterns -> proposed rules.
- Export ratio picker: 9:16, 1:1, 16:9 labelled with best-fit platforms.
- BYOK: users supply Anthropic, transcription (Deepgram/AssemblyAI/Groq), optional Wispr
  keys. Keys encrypted (AES-GCM, server secret), never returned to browser (show last 4),
  validated on save.

## 2. Stack (do not substitute without asking)

- pnpm workspaces monorepo
- apps/web: SvelteKit (Svelte 5, TypeScript strict), Feature-Sliced Design inside src/lib
- apps/worker: Python 3.12, managed with uv, FFmpeg in the Docker image, pydantic
- packages/timeline-schema: JSON Schema as single source of truth; generate/hand-mirror
  a zod schema (web) and pydantic model (worker); include a test that both validate the
  same fixtures in packages/timeline-schema/fixtures/
- Supabase (hosted): Postgres + Google OAuth login. Migrations in supabase/migrations/
- Cloudflare R2 for video storage; browser uploads via presigned URLs (never through
  SvelteKit request bodies)
- Queue = Postgres `jobs` table claimed with FOR UPDATE SKIP LOCKED (no Redis)
- YouTube connect is a SEPARATE OAuth flow from login; refresh tokens stored encrypted
- Lint/format: Biome or Prettier+ESLint for web (pick one, record why in an ADR), ruff for
  the worker

## 3. Phase A: Scaffold + setup commands

Run the setup yourself (ask before anything that needs my credentials):
- git init, .gitignore (node, python, .env, tmp/, .DS_Store)
- pnpm workspace, `npx sv create apps/web` (TypeScript, minimal), add needed adapters
- `uv init apps/worker`, add ruff + pydantic + psycopg + boto3
- `npx supabase init` (do not link a project yet)
- docker-compose.yml with ONLY the worker service (hosted Supabase/R2 are used even locally)
- .env.example for every env var, grouped and commented; never create a real .env
- Root scripts: `pnpm dev`, `pnpm check` (typecheck + lint + docs check for all packages),
  `pnpm test`, `pnpm worker` (docker compose up worker)
- Placeholder routes for every page in section 1 (title + "TODO" only)
- Worker: a loop that logs "claiming jobs..." every 5s, with a stub step pipeline
- Initial migration with tables: profiles, user_keys, brand_profile, brand_rules,
  jobs, clips, timelines, posts, post_metrics, platform_connections. Add RLS policies so
  users only see their own rows.

## 4. Phase B: AI context system (most important part)

Goal: a future agent can make any change by reading ~2-4 small docs instead of searching
the codebase.

Root files:
- CLAUDE.md (under 150 lines): one-paragraph product summary, stack, repo map (one line
  per top-level folder), commands, hard rules (below), and a pointer: "Before working on
  any area, read docs/INDEX.md and open only the docs it lists for that area."
  Do NOT @import docs from CLAUDE.md; reference them as plain backticked paths so they
  load on demand.
- AGENTS.md as a symlink to CLAUDE.md (`ln -s CLAUDE.md AGENTS.md`) so other agents work too.

Nested CLAUDE.md (short, area-specific conventions + which docs to read):
- apps/web/CLAUDE.md, apps/worker/CLAUDE.md, packages/timeline-schema/CLAUDE.md,
  supabase/CLAUDE.md

Path-scoped rules in .claude/rules/ (with `paths` frontmatter):
- web.md (apps/web/**): FSD layer rules, Svelte 5 runes only, server-only code in
  $lib/server
- worker.md (apps/worker/**): pipeline steps are idempotent, check stop flag between steps
- migrations.md (supabase/**): never edit an applied migration; always add RLS
- timeline.md (packages/timeline-schema/**, **/timeline/**): schema change = update JSON
  Schema + zod + pydantic + fixtures + docs/timeline.md in the same change

docs/ (each doc starts with frontmatter: `covers:` list of code paths, `last_updated:`):
- INDEX.md: table of "If you're changing X -> read these docs" + one-line doc summaries
- product/spec.md, product/pages.md (each page: purpose, data, actions)
- architecture.md (diagram in text/mermaid: web, worker, Supabase, R2, YouTube)
- data-model.md (every table, columns, ownership, RLS summary)
- queue.md (states, transitions, claiming, stop/retry)
- pipeline.md (each worker step, inputs/outputs, failure behaviour)
- timeline.md (schema, examples, how edits map to FFmpeg)
- agent.md (planner, todo list format, tool list with signatures, memory proposal flow)
- brand-memory.md (stated vs learned, promotion rule, conflict handling)
- publishing.md (YouTube OAuth, scheduler loop, checkpoints, scoring)
- auth-and-keys.md (Google login, BYOK encryption, key validation)
- env.md (every env var, where used)
- glossary.md (clip, job, timeline, rule, checkpoint, baseline...)
- decisions/ ADRs: 0001-monorepo, 0002-postgres-queue, 0003-timeline-json,
  0004-byok, 0005-lint-choice (short: context, decision, consequences)

Code <-> docs links:
- Every module entry file starts with a one-line comment: `// Docs: docs/queue.md`
  (or `# Docs: ...` in Python).
- scripts/check-docs.(ts|py), run by `pnpm check`, that fails if:
  a path in any doc's `covers:` doesn't exist; a doc is missing from INDEX.md;
  a `Docs:` header points to a missing doc; or a top-level module under
  apps/web/src/lib/* or apps/worker/pipeline/* has no `Docs:` header.

Skills in .claude/skills/<name>/SKILL.md (name + description frontmatter; concise steps;
each ends with "update affected docs + run pnpm check"):
- add-migration: create migration, RLS, update data-model.md
- add-pipeline-step: worker step template, idempotency, stop-check, update pipeline.md
- add-agent-tool: pure timeline function + tool schema + test + update agent.md
- add-page: SvelteKit route in FSD structure + update product/pages.md
- change-timeline-schema: the 5-place update from rules/timeline.md
- sync-docs: diff changed files vs docs `covers:` and update stale docs
- new-adr: create next numbered ADR

.claude/settings.json:
- permission allowlist for safe commands: pnpm, uv, docker compose, npx supabase
  (local only), git status/diff/log
- a Stop hook that runs the docs check and reports failures (verify the current hook
  config format in the Claude Code docs before writing it)

Hard rules to put in CLAUDE.md:
1. Any code change updates the docs whose `covers:` include that path, in the same change.
2. Never put secrets in code or docs; only .env.example with placeholders.
3. Timeline JSON is the only way to change a clip; never edit video files directly in web.
4. Agent tools never write brand memory directly; they propose.
5. Prefer small, explicit modules over clever abstractions; this is a hackathon.

## 5. Acceptance (verify yourself, then report)

- `pnpm install && pnpm dev` serves all placeholder pages
- `pnpm worker` starts the worker loop in Docker with FFmpeg available (`ffmpeg -version`)
- `pnpm check` passes, including the docs check
- Timeline fixtures validate in both zod and pydantic
- AGENTS.md symlink resolves
- Final report: file tree, what each context file is for, anything you were unsure about

Stop after Phase A and show me the tree. Then do Phase B. Do not start product features.
