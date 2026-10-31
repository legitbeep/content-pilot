---
covers:
  - supabase/migrations
  - apps/web/src/lib/entities
last_updated: 2026-10-31
---
# Data model

Source: `supabase/migrations/`. Every table has `user_id → auth.users` (profiles uses `id`),
`on delete cascade`. RLS on everywhere.

## RLS summary
- **Own rows** (`user_id = auth.uid()`, all ops): profiles, brand_profile, brand_rules, jobs,
  clips, timelines, posts, post_metrics, baseline_seeds.
- **Service role only** (RLS on, no policies): `user_keys`, `platform_connections` — hold
  ciphertext. Owners read safe columns via views `user_keys_public`
  (provider, last4, validated_at, created_at) and `platform_connections_public`
  (platform, account_name, connected_at). Views run as owner and filter on `auth.uid()`;
  `anon` has no access.
- Worker uses `DATABASE_URL` (postgres role) → bypasses RLS; it must always scope by `user_id`.

## Enums
`job_status` pending|processing|needs_input|done|stopped|failed ·
`platform` youtube|instagram|linkedin|x · `key_provider` anthropic|deepgram|assemblyai|groq|wispr ·
`rule_source` stated|learned · `rule_status` proposed|active|rejected ·
`post_status` draft|scheduled|posted|failed · `checkpoint` 48h|7d|14d|30d

## Tables
| Table | Key columns | Notes |
|---|---|---|
| profiles | id (=auth uid), display_name, onboarded_at | Row created by `on_auth_user_created` trigger |
| user_keys | provider, ciphertext, iv, last4, validated_at | unique (user_id, provider). `docs/auth-and-keys.md` |
| brand_profile | user_id (pk), answers jsonb, example_posts jsonb | Onboarding output |
| brand_rules | source, status, rule, evidence jsonb, conflicts_with | `docs/brand-memory.md` |
| jobs | status, position, source_key, current_step, stop_requested, input_request, resume_from_step, error, attempts, claimed_at, transcript_path, finished_at, proceeded_at, source_deleted_at | `docs/queue.md`; transcript + cleanup: `docs/pipeline.md` |
| clips | job_id, start_s, end_s, reason, score, file_key, file_start_s, file_end_s, words jsonb, selected | `start_s/end_s/file_*` in source seconds; `words` relative to the clip file (handles included). unique (job_id, start_s, end_s). `file_key` null once deleted |
| timelines | clip_id (unique), data jsonb, revision, rendered_key, rendered_revision | `data` validates against timeline-schema. Render needed when `rendered_revision < revision` |
| posts | clip_id, platform, caption, status, scheduled_at, posted_at, external_id, error | One row per platform caption |
| post_metrics | post_id, checkpoint, views, likes, comments, score | unique (post_id, checkpoint). `docs/publishing.md` |
| platform_connections | platform, refresh_token_ciphertext, iv, account_name | unique (user_id, platform) |
| baseline_seeds | platform, external_id, checkpoint, views, published_at | Pre-existing channel videos seeding the baseline. unique (user_id, platform, external_id, checkpoint). `docs/publishing.md` |

Indexes: `jobs_claim_idx` (pending by position), `jobs_cleanup_idx` (done, source not yet deleted), `posts_due_idx` (scheduled by time).

R2 objects (not tables): `uploads/…` source video, `transcripts/<job_id>.json`, `clips/<clip_id>/source.mp4`.
