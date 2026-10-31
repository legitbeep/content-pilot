-- Docs: docs/publishing.md
-- Plan 8: YouTube connect, posts scheduler. Additive + idempotent.

alter type post_status add value if not exists 'publishing';
alter type post_status add value if not exists 'cancelled';

alter table posts
  add column if not exists title text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists external_url text,
  add column if not exists attempts integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table platform_connections
  add column if not exists channel_id text,
  add column if not exists avatar_url text;

-- Owned by plan 6 (render) and plan 5 (description); nullable here so publish can seed.
alter table clips
  add column if not exists render_path text,     -- R2 key renders/{clip_id}.mp4
  add column if not exists render_status text,
  add column if not exists description text;

-- New columns appended at the end (create or replace view can only add trailing columns).
create or replace view platform_connections_public as
  select platform, account_name, connected_at, channel_id, avatar_url
  from platform_connections where user_id = (select auth.uid());

revoke all on platform_connections_public from public, anon;
grant select on platform_connections_public to authenticated;
