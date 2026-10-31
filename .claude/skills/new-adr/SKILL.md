---
name: new-adr
description: Record an architecture decision as the next numbered ADR in docs/decisions.
---
# New ADR

1. `ls docs/decisions/` → next number `NNNN` (4 digits).
2. Create `docs/decisions/NNNN-<kebab-title>.md`:
   ```markdown
   ---
   covers:
     - <code paths this decision governs, or leave as `covers: []`>
   last_updated: <today>
   ---
   # NNNN — <Title>

   **Status:** accepted

   **Context.** <forces, constraints — 2-4 lines>

   **Decision.** <what we do>

   **Consequences.** <trade-offs, follow-ups>
   ```
3. Superseding an ADR: set the old one's status to `superseded by NNNN`.
4. Add it to the "All docs" list in `docs/INDEX.md`.
5. Update affected docs + run `pnpm check`.
