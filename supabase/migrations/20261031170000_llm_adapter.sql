-- Plan llm: provider adapters (docs/llm.md). Idempotent, additive.

-- Gemini keys (BYOK). Anthropic/Groq already exist in the enum.
alter type key_provider add value if not exists 'gemini';

-- Per-user AI provider choices. Missing row = defaults (first usable key).
create table if not exists ai_settings (
  user_id uuid primary key references auth.users on delete cascade,
  llm_provider key_provider,              -- default LLM provider (anthropic | gemini | groq)
  transcription_provider key_provider,    -- deepgram | groq
  task_overrides jsonb not null default '{}'::jsonb,  -- { "<task>": "<provider>" }
  updated_at timestamptz not null default now()
);
alter table ai_settings enable row level security;
drop policy if exists "own ai_settings" on ai_settings;
create policy "own ai_settings" on ai_settings
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- One row per adapter call (web or worker). Written by the server/worker; owners read their own.
create table if not exists llm_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  model text not null,
  task text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  latency_ms int not null default 0,
  ok boolean not null,
  error_kind text,
  created_at timestamptz not null default now()
);
create index if not exists llm_calls_user_created_idx on llm_calls (user_id, created_at desc);
alter table llm_calls enable row level security;
drop policy if exists "own llm_calls read" on llm_calls;
create policy "own llm_calls read" on llm_calls
  for select using (user_id = (select auth.uid()));

-- Whose key paid for the call: the user's own (BYOK) or the shared demo keys (ADR 0008).
alter table llm_calls add column if not exists key_source text not null default 'user';
