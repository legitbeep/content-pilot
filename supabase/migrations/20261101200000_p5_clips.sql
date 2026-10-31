-- Docs: docs/data-model.md
-- Plan 5: clip feedback, job memory snapshot + intent, clip candidate columns. Additive + idempotent.

-- Every approve/reject in the Clip Picker (append-only; plan 7 learns from it).
create table if not exists clip_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  clip_id uuid not null references clips on delete cascade,
  job_id uuid not null references jobs on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists clip_feedback_user_created_idx on clip_feedback (user_id, created_at);

alter table clip_feedback enable row level security;
drop policy if exists own_rows on clip_feedback;
create policy own_rows on clip_feedback for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Brand memory frozen at job confirm (buildMemoryContext, scope clip_selection) and the
-- job-scoped answer to the brand_fit question (never a brand rule).
alter table jobs
  add column if not exists memory_snapshot text,
  add column if not exists user_intent text;

-- Clip candidates (extract_clips). features = {topic, length_bucket, hook_type}.
alter table clips
  add column if not exists hook text,
  add column if not exists reasons jsonb not null default '[]',
  add column if not exists scores jsonb not null default '{}',
  add column if not exists features jsonb,
  add column if not exists ranking_score numeric,
  add column if not exists thumb_key text;
