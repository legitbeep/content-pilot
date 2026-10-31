---
name: sync-docs
description: Find docs made stale by code changes (via covers frontmatter) and update them.
---
# Sync docs

1. List changed files: `git diff --name-only HEAD` (uncommitted) or `git diff --name-only <base>...HEAD`.
2. For each doc in `docs/`, read its `covers:` frontmatter; a doc is affected when a changed path
   equals or sits under a covered path.
3. For every affected doc: read the changed code, update the doc to match, set `last_updated`
   to today. Done when each affected doc describes the code as it now is.
4. New doc → add it to `docs/INDEX.md` (task table + "All docs"). New code area no doc covers →
   add the path to the right doc's `covers:`.
5. Update affected docs + run `pnpm check`.
