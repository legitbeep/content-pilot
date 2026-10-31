-- Docs: docs/data-model.md
-- Key status: valid (validated_at set), unverified (both null), invalid (invalid_at set: the
-- provider rejected a saved key on use, e.g. Deepgram 401 in the worker). Saving a key clears it.

alter table user_keys add column invalid_at timestamptz;

create or replace view user_keys_public as
  select provider, last4, validated_at, created_at, invalid_at
  from user_keys where user_id = (select auth.uid());
