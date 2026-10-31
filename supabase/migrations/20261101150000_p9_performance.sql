-- Docs: docs/performance.md
-- Plan 9: checkpoints, metrics extras, feature weights, change log. Additive + idempotent.

-- One row per (post, checkpoint); the worker's checkpoints loop processes due ones.
create table if not exists post_checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  post_id uuid not null references posts on delete cascade,
  checkpoint checkpoint not null,
  due_at timestamptz not null,
  claimed_at timestamptz,
  attempts integer not null default 0,
  done_at timestamptz,
  error text,
  unique (post_id, checkpoint)
);
create index if not exists post_checkpoints_due_idx on post_checkpoints (due_at)
  where done_at is null;

alter table post_checkpoints enable row level security;
drop policy if exists own_rows on post_checkpoints;
create policy own_rows on post_checkpoints for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A post that becomes posted gets its 4 checkpoints (48h, 7d, 14d, 30d after posted_at).
create or replace function public.create_post_checkpoints() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'posted' and new.posted_at is not null then
    insert into public.post_checkpoints (user_id, post_id, checkpoint, due_at)
    select new.user_id, new.id, c.cp::public.checkpoint, new.posted_at + c.after
    from (values ('48h', interval '48 hours'), ('7d', interval '7 days'),
                 ('14d', interval '14 days'), ('30d', interval '30 days')) as c(cp, after)
    on conflict (post_id, checkpoint) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_create_checkpoints on posts;
create trigger posts_create_checkpoints
  after insert or update of status, posted_at on posts
  for each row execute function public.create_post_checkpoints();

alter table post_metrics
  add column if not exists avg_view_pct numeric,       -- YouTube Analytics averageViewPercentage
  add column if not exists verdict text check (verdict in ('boost', 'neutral', 'downgrade')),
  add column if not exists rating smallint check (rating between 1 and 5),
  add column if not exists rating_note text;

-- Baseline seeding state (platform_connections is plan 8's; nullable columns only).
alter table platform_connections
  add column if not exists baselines_seeded_at timestamptz,
  add column if not exists baseline_method text;      -- analytics | total_views

-- Plan 5 owns these (already on the shared DB); repeated here so this branch stands alone.
alter table clips
  add column if not exists features jsonb,
  add column if not exists ranking_score numeric;

-- Per user + feature ('topic:x', 'length:short', 'hook:question'): moving average of scores.
create table if not exists feature_weights (
  user_id uuid not null references auth.users on delete cascade,
  feature text not null,
  weight numeric not null,
  samples integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);
alter table feature_weights enable row level security;
drop policy if exists own_rows on feature_weights;
create policy own_rows on feature_weights for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Human-readable learning events shown as Home insight cards.
create table if not exists change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,                                  -- weight | rule
  feature text,
  message text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists change_log_user_idx on change_log (user_id, created_at desc);
alter table change_log enable row level security;
drop policy if exists own_rows on change_log;
create policy own_rows on change_log for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
