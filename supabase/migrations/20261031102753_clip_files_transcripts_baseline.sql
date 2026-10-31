-- Docs: docs/data-model.md
-- Clip files with handles, transcript storage, deferred source cleanup, baseline seeds.

-- Transcript + cleanup timing on jobs
alter table jobs
  add column transcript_path text,            -- R2 key of full transcript JSON (word timestamps)
  add column finished_at timestamptz,         -- set when status -> done; starts the 48h cleanup clock
  add column proceeded_at timestamptz,        -- user clicked "Proceed with editing"
  add column source_deleted_at timestamptz;   -- cleanup_source done (idempotency marker)

create index jobs_cleanup_idx on jobs (finished_at)
  where status = 'done' and source_deleted_at is null;

-- Each candidate clip is its own R2 file with 5s handles.
-- start_s/end_s stay in SOURCE seconds; file_start_s/file_end_s are the handle-inclusive range
-- the file was cut from. Timeline + words times are relative to the file (t=0 = file_start_s).
alter table clips
  add column file_key text,                   -- null once deleted (unselected after cleanup)
  add column file_start_s numeric,
  add column file_end_s numeric,
  add column words jsonb not null default '[]',  -- [{w, start, end}] relative to the clip file
  add column selected boolean not null default false,
  add constraint clips_job_range_key unique (job_id, start_s, end_s);  -- idempotent extract_clips

-- Baseline seeds: per-checkpoint views of the channel's videos from before Clip Studio.
create table baseline_seeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  platform platform not null,
  external_id text not null,                  -- e.g. YouTube video id
  checkpoint checkpoint not null,
  views bigint not null,
  published_at timestamptz not null,
  captured_at timestamptz not null default now(),
  unique (user_id, platform, external_id, checkpoint)
);

alter table baseline_seeds enable row level security;
create policy own_rows on baseline_seeds for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
