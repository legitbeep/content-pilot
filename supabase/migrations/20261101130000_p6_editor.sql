-- Docs: docs/data-model.md
-- Plan 6: editor render state on clips + edit_events log. Additive + idempotent.

-- Render state (render_path/render_status may already exist from plan 8's migration).
alter table clips
  add column if not exists render_status text,          -- null | queued | rendering | done | failed
  add column if not exists render_path text,            -- R2 key renders/{clip_id}.mp4
  add column if not exists render_error text,           -- user-readable
  add column if not exists render_requested_at timestamptz,
  add column if not exists rendered_at timestamptz;

create index if not exists clips_render_queue_idx on clips (render_requested_at)
  where render_status = 'queued';

-- Every applied timeline operation (manual or agent). Plan 7 learns from these.
create table if not exists edit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  clip_id uuid not null references clips on delete cascade,
  op text not null,
  args jsonb not null default '{}',
  summary text not null,
  source text not null check (source in ('manual', 'agent')),
  created_at timestamptz not null default now()
);

create index if not exists edit_events_clip_idx on edit_events (clip_id, created_at);

alter table edit_events enable row level security;
drop policy if exists own_rows on edit_events;
create policy own_rows on edit_events for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
