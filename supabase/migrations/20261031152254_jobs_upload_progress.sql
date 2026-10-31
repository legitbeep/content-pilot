-- Docs: docs/data-model.md
-- Upload request, probed media info, live progress, step history and split errors on jobs.

alter table jobs
  add column request text,                          -- "What should we look for?" (optional)
  add column duration_s numeric,                    -- browser metadata at upload; probe overwrites
  add column media jsonb,                           -- probe output: {duration_s, width, height, has_audio}
  add column progress smallint not null default 0,  -- 0-100, overall pipeline progress
  add column steps jsonb not null default '[]',     -- [{step, status, started_at, finished_at}]
  add column error_detail text,                     -- technical detail for debugging; `error` is user-readable
  add column note text;                             -- informational, e.g. "Clip extraction not built yet"

-- Claim query counts a user's processing jobs (max 2 per user, docs/queue.md).
create index jobs_user_processing_idx on jobs (user_id) where status = 'processing';
