-- Docs: docs/data-model.md
-- Initial schema. Every table is owned by a user; RLS restricts rows to auth.uid().
-- user_keys and platform_connections hold ciphertext: RLS on, NO policies -> service role only.
-- Owners read the safe columns through the *_public views at the bottom.

create type job_status as enum ('pending', 'processing', 'needs_input', 'done', 'stopped', 'failed');
create type platform as enum ('youtube', 'instagram', 'linkedin', 'x');
create type key_provider as enum ('anthropic', 'deepgram', 'assemblyai', 'groq', 'wispr');
create type rule_source as enum ('stated', 'learned');
create type rule_status as enum ('proposed', 'active', 'rejected');
create type post_status as enum ('draft', 'scheduled', 'posted', 'failed');
create type checkpoint as enum ('48h', '7d', '14d', '30d');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table user_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider key_provider not null,
  ciphertext bytea not null,          -- AES-GCM, server secret (docs/auth-and-keys.md)
  iv bytea not null,
  last4 text not null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table brand_profile (
  user_id uuid primary key references auth.users on delete cascade,
  answers jsonb not null default '{}',
  example_posts jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table brand_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  source rule_source not null,
  status rule_status not null default 'proposed',
  rule text not null,
  evidence jsonb not null default '[]',  -- edit ids / post ids that led to a learned rule
  conflicts_with uuid references brand_rules on delete set null,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  status job_status not null default 'pending',
  position integer not null default 0,     -- order among pending jobs
  source_key text not null,                -- R2 key of uploaded video
  title text,
  current_step text,
  stop_requested boolean not null default false,
  input_request jsonb,                     -- brand-fit question shown while status = 'needs_input'
  resume_from_step text,                   -- pipeline step to start at when re-claimed (null = first)
  error text,
  attempts integer not null default 0,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_claim_idx on jobs (status, position, created_at) where status = 'pending';

create table clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  job_id uuid not null references jobs on delete cascade,
  start_s numeric not null,
  end_s numeric not null,
  reason text not null,
  score numeric,
  created_at timestamptz not null default now(),
  check (end_s > start_s)
);

create table timelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  clip_id uuid not null unique references clips on delete cascade,
  data jsonb not null,                     -- packages/timeline-schema
  revision integer not null default 1,
  rendered_key text,                       -- R2 key of last FFmpeg render
  rendered_revision integer,
  updated_at timestamptz not null default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  clip_id uuid not null references clips on delete cascade,
  platform platform not null,
  caption text not null default '',
  status post_status not null default 'draft',
  scheduled_at timestamptz,
  posted_at timestamptz,
  external_id text,                        -- e.g. YouTube video id
  error text,
  created_at timestamptz not null default now()
);
create index posts_due_idx on posts (scheduled_at) where status = 'scheduled';

create table post_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  post_id uuid not null references posts on delete cascade,
  checkpoint checkpoint not null,
  views bigint not null,
  likes bigint,
  comments bigint,
  score numeric,                           -- views / user's median views at this checkpoint
  captured_at timestamptz not null default now(),
  unique (post_id, checkpoint)
);

create table platform_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  platform platform not null,
  refresh_token_ciphertext bytea not null,
  iv bytea not null,
  account_name text,
  connected_at timestamptz not null default now(),
  unique (user_id, platform)
);

-- RLS -------------------------------------------------------------------------

alter table profiles enable row level security;
alter table user_keys enable row level security;
alter table brand_profile enable row level security;
alter table brand_rules enable row level security;
alter table jobs enable row level security;
alter table clips enable row level security;
alter table timelines enable row level security;
alter table posts enable row level security;
alter table post_metrics enable row level security;
alter table platform_connections enable row level security;

create policy own_profile on profiles for all
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy own_rows on brand_profile for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on brand_rules for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on jobs for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on clips for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on timelines for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on posts for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_rows on post_metrics for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- user_keys, platform_connections: intentionally no policies (service role only).

-- Profile row on signup --------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Owner-only safe views over secret tables -------------------------------------
-- Views run as their owner (security_invoker = false), so they bypass the deny-all RLS above;
-- the WHERE clause is the access control. Never add secret columns here.

create view user_keys_public as
  select provider, last4, validated_at, created_at
  from user_keys where user_id = (select auth.uid());

create view platform_connections_public as
  select platform, account_name, connected_at
  from platform_connections where user_id = (select auth.uid());

revoke all on user_keys_public, platform_connections_public from public, anon;
grant select on user_keys_public, platform_connections_public to authenticated;
