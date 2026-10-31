-- Docs: docs/brand-memory.md
-- Plan 7: per-user cursor for the edit-learning analyzer (last edit_events.created_at analyzed).
-- The analyzer claims a run with compare-and-set on last_event_at so two runs never double count.
create table if not exists learn_cursor (
  user_id uuid primary key references auth.users on delete cascade,
  last_event_at timestamptz not null default 'epoch',
  ran_at timestamptz
);

alter table learn_cursor enable row level security;
drop policy if exists own_rows on learn_cursor;
create policy own_rows on learn_cursor for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
