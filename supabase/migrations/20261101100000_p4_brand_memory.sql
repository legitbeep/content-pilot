-- Docs: docs/data-model.md
-- Plan 4: brand memory. Adapts brand_profile / brand_rules (docs/brand-memory.md).
-- Old enum values (stated, learned, proposed, rejected) stay valid but are no longer written.

alter type rule_source add value if not exists 'onboarding';
alter type rule_source add value if not exists 'edits';
alter type rule_source add value if not exists 'performance';
alter type rule_source add value if not exists 'manual';
alter type rule_status add value if not exists 'candidate';
alter type rule_status add value if not exists 'pinned';
alter type rule_status add value if not exists 'archived';

do $$ begin
  create type rule_scope as enum ('clip_selection', 'copy', 'captions', 'editing', 'all');
exception when duplicate_object then null;
end $$;

alter table brand_rules
  add column if not exists scope rule_scope not null default 'all',
  add column if not exists evidence_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists brand_rules_user_status_idx on brand_rules (user_id, status);

alter table brand_profile
  add column if not exists onboarding_step integer not null default 1,
  add column if not exists onboarding_completed_at timestamptz;
