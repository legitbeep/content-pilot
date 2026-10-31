---
name: add-migration
description: Add a Supabase migration — new table, column, enum, index, view or RLS policy change.
---
# Add a migration

1. Read `docs/data-model.md`.
2. `npx supabase migration new <snake_case_name>` (never edit an existing migration).
3. Write the SQL. First line: `-- Docs: docs/data-model.md`.
4. New table: `user_id uuid not null references auth.users on delete cascade`, `enable row level
   security`, owner policy `for all using (user_id = (select auth.uid())) with check (same)`.
   Secret columns: RLS with no policies + a `<table>_public` view of safe columns filtered by
   `auth.uid()`, `revoke ... from public, anon`, `grant select ... to authenticated`.
5. Apply it to the shared DB: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<file>`
   (`DATABASE_URL` from `apps/worker/.env`; no psql → psycopg fallback in `docs/data-model.md`).
   Never `supabase db push` on a branch.
6. Optional local sanity check: apply to a throwaway `postgres:17-alpine` container with stub
   `auth` schema, `auth.users`, `auth.uid()`, `anon`/`authenticated` roles.
7. Update `docs/data-model.md` (tables, enums, RLS summary) and any area doc that uses the table.
8. Update affected docs + run `pnpm check`.
