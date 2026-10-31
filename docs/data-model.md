---
covers:
  - supabase/migrations
  - apps/web/src/lib/entities
last_updated: 2026-11-01
---
# Data model

Source: `supabase/migrations/`. Migrations are idempotent (`if not exists`, `create or replace`,
`drop policy if exists` first).

**Applying a migration** (feature branch, shared DB): `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f
supabase/migrations/<file>` with `DATABASE_URL` from `apps/worker/.env`. Fallback when `psql`
isn't installed: run the file through psycopg from the worker venv:
`uv run --directory apps/worker --env-file .env python -c "import os, psycopg; psycopg.connect(os.environ['DATABASE_URL'], autocommit=True).execute(open('../../supabase/migrations/<file>').read())"`
(multi-statement SQL without parameters is fine). Never `supabase db push` on a branch; the
orchestrator runs `npx supabase db push --include-all` on main after merging.

 Every table has `user_id → auth.users` (profiles uses `id`),
`on delete cascade`. RLS on everywhere.

## RLS summary
- **Own rows** (`user_id = auth.uid()`, all ops): profiles, brand_profile, brand_rules, jobs,
  clips, clip_feedback, timelines, edit_events, learn_cursor, posts, post_metrics, baseline_seeds, ai_settings, recommendations. Read-only own rows: llm_calls.
- **Service role only** (RLS on, no policies): `demo_usage`; `user_keys`, `platform_connections` — hold
  ciphertext. Owners read safe columns via views `user_keys_public`
  (provider, last4, validated_at, invalid_at, created_at) and `platform_connections_public`
  (platform, account_name, connected_at, channel_id, avatar_url). Views run as owner and filter on `auth.uid()`;
  `anon` has no access.
- Worker uses `DATABASE_URL` (postgres role) → bypasses RLS; it must always scope by `user_id`.

## Enums
`job_status` pending|processing|needs_input|done|stopped|failed ·
`platform` youtube|instagram|linkedin|x · `key_provider` anthropic|deepgram|assemblyai|groq|wispr|gemini (`assemblyai` unused) ·
`rule_source` onboarding|edits|performance|manual (legacy stated|learned) · `rule_status` candidate|active|pinned|archived (legacy proposed|rejected) · `rule_scope` clip_selection|copy|captions|editing|all ·
`post_status` draft|scheduled|publishing|posted|failed|cancelled · `checkpoint` 48h|7d|14d|30d

## Tables
| Table | Key columns | Notes |
|---|---|---|
| profiles | id (=auth uid), display_name, onboarded_at | Row created by `on_auth_user_created` trigger |
| user_keys | provider, ciphertext, iv, last4, validated_at, invalid_at | unique (user_id, provider). `docs/auth-and-keys.md` |
| brand_profile | user_id (pk), answers jsonb, example_posts jsonb, onboarding_step, onboarding_completed_at | Onboarding output; `answers` shape = `BrandProfile` (`docs/brand-memory.md`). `onboarding_completed_at` gates the shell |
| brand_rules | source, status, scope, rule (text), evidence_count, evidence jsonb, conflicts_with, updated_at | `docs/brand-memory.md` |
| jobs | status, position, source_key, title, request, duration_s, media jsonb, current_step, progress, steps jsonb, stop_requested, input_request, resume_from_step, error, error_detail, note, attempts, claimed_at, transcript_path, finished_at, proceeded_at, source_deleted_at | `error` is user-readable, `error_detail` technical. `media` = probe output. `memory_snapshot` (text, `buildMemoryContext` scope clip_selection, frozen at job create), `user_intent` (job-scoped answer to the brand_fit question, never a brand rule). `docs/queue.md`; transcript + cleanup: `docs/pipeline.md` |
| clips | job_id, start_s, end_s, reason, score, file_key, file_start_s, file_end_s, words jsonb, selected, description | `start_s/end_s/file_*` in source seconds; `words` relative to the clip file (handles included). unique (job_id, start_s, end_s). `file_key` null once deleted. Render: `render_status` (text + CHECK: null\|queued\|rendering\|done\|failed), `render_requested_at`, `render_path` (`renders/<clip_id>.mp4`), `render_error`, `rendered_at` (`docs/timeline.md`). Candidate (plan 5): `hook`, `reasons` jsonb string[], `scores` jsonb `{hook_strength, standalone, brand_fit, request_match}` 0-1, `features` jsonb `{topic, length_bucket: short\|medium\|long, hook_type}`, `ranking_score`, `thumb_key` (`docs/pipeline.md`) |
| clip_feedback | clip_id, job_id, decision (`approved`\|`rejected`), reason (null), created_at | Append-only, one row per Clip Picker approve/reject. Own rows. Written by plan 5, read by plan 7's learner |
| timelines | clip_id (unique), data jsonb, revision, rendered_key, rendered_revision | `data` validates against timeline-schema. Render needed when `rendered_revision < revision` |
| edit_events | clip_id, op, args jsonb, summary, source (`manual`\|`agent`), created_at | One row per applied timeline op (and undo/redo). Own rows. `docs/timeline.md` |
| learn_cursor | user_id (pk), last_event_at, ran_at | Plan 7 edit-learning cursor: last `edit_events.created_at` analyzed (compare-and-set claim). Own rows. `docs/brand-memory.md` |
| posts | clip_id, platform, title, caption, tags text[], status, scheduled_at, posted_at, external_id, external_url, error, attempts, updated_at | One row per YouTube post (copy-only platforms get no row). `docs/publishing.md` |
| post_metrics | post_id, checkpoint, views, likes, comments, score, avg_view_pct, verdict, rating, rating_note | unique (post_id, checkpoint). `docs/publishing.md` |
| platform_connections | platform, refresh_token_ciphertext, iv, account_name, channel_id, avatar_url, baselines_seeded_at, baseline_method | unique (user_id, platform). `docs/publishing.md` |
| ai_settings | user_id (pk), llm_provider, transcription_provider, task_overrides jsonb | AI provider choices; no row = defaults. Own rows. `docs/llm.md` |
| llm_calls | provider, key_source (user\|demo), model, task, input_tokens, output_tokens, latency_ms, ok, error_kind | One row per adapter call. Owners read; server/worker write. `docs/llm.md` |
| demo_usage | user_id, kind (`job` = demo-keyed job, `upload` = any new job), created_at | Append-only usage log; the daily demo cap counts `job`, the 5-a-day cap counts `upload` (`docs/queue.md`). No FK to jobs (deleting a job never frees a slot). RLS on, no policies (server only). `docs/llm.md` |
| baseline_seeds | platform, external_id, checkpoint, views, published_at | Pre-existing channel videos seeding the baseline. unique (user_id, platform, external_id, checkpoint). `docs/publishing.md` |
| post_checkpoints | post_id, checkpoint, due_at, claimed_at, attempts, done_at, error | unique (post_id, checkpoint); trigger `posts_create_checkpoints` adds 48h/7d/14d/30d when a post is `posted`. Own rows. `docs/performance.md` |
| feature_weights | (user_id, feature) pk, weight, samples, updated_at | Learned ranking weights. Own rows. `docs/performance.md` |
| change_log | kind, feature, message, data jsonb, created_at | Learning events for Home insight cards. Own rows. `docs/performance.md` |
| recommendations | user_id (pk), items jsonb, created_at | Latest Home long-form recommendations batch (`Recommendation[]`: videoId, title, channel, license, reason, url, thumbnail); a refresh upserts it. Own rows. `docs/performance.md` |

Indexes: `brand_rules_user_status_idx`, `llm_calls_user_created_idx` (usage summary), `jobs_claim_idx` (pending by position), `jobs_user_processing_idx` (per-user processing count), `jobs_cleanup_idx` (done, source not yet deleted), `posts_due_idx` (scheduled by time), `post_checkpoints_due_idx` (open checkpoints by due time), `change_log_user_idx`, `clips_render_queue_idx` (queued renders), `edit_events_clip_idx`.

R2 objects (not tables): `uploads/<user_id>/<upload_id>/<name>` source video,
`brand/<user_id>/logo.<ext>` brand logo, `transcripts/<job_id>.json` (normalised; older jobs also have a raw `transcripts/<job_id>.deepgram.json`), `clips/<clip_id>/source.mp4`, `renders/<clip_id>.mp4` (rendered clip, `clips.render_path`).
