-- Docs: docs/data-model.md
-- Home "Recommended long-form videos": the latest batch per user. Refresh upserts (replaces) it.

create table if not exists recommendations (
  user_id uuid primary key references auth.users on delete cascade,
  items jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table recommendations enable row level security;
drop policy if exists own_rows on recommendations;
create policy own_rows on recommendations for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
