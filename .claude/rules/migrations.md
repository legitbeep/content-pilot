---
paths:
  - "supabase/**"
---
# Migration rules

- **Applied migrations are immutable.** Every schema change is a new file from
  `npx supabase migration new <name>`.
- **Every new table enables RLS in the same migration** and gets an owner policy
  (`user_id = (select auth.uid())`, `using` + `with check`), or — for secrets — no policies plus a
  `*_public` view exposing safe columns.
- Update `docs/data-model.md` in the same change.
