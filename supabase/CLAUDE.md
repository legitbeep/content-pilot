# supabase

Hosted Supabase project; this folder holds `config.toml` and `migrations/`. Not linked from
this repo — remote changes (`link`, `db push`) are done by the human. Read `docs/data-model.md`.

- New schema change = new migration via the `add-migration` skill (`npx supabase migration new <name>`).
- Tables holding secrets (`user_keys`, `platform_connections`) have RLS with no policies; owners
  read them through `*_public` views.
