-- Plan llm: append-only log of demo-key usage (ADR 0008, docs/llm.md). The daily demo cap counts
-- these rows, so deleting a job never frees a slot. No FK to jobs on purpose. Idempotent.
create table if not exists demo_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null default 'job',
  created_at timestamptz not null default now()
);
create index if not exists demo_usage_user_created_idx on demo_usage (user_id, created_at);
-- RLS on, no policies: service role (web secret key) and the worker only, no client access.
alter table demo_usage enable row level security;
