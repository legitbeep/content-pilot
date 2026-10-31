---
covers:
  - apps/worker/pipeline/brand_fit.py
  - supabase/migrations
last_updated: 2026-10-31
---
# Brand memory

Tables: `brand_profile` (raw onboarding answers + example posts), `brand_rules` (one row per rule).

## Stated vs learned
| | Stated | Learned |
|---|---|---|
| Origin | Onboarding answers, Brand Memory page | Repeated edits (3+) or performance patterns |
| `source` | `stated` | `learned` |
| Initial `status` | `active` | `proposed` |
| Evidence | — | `evidence` jsonb: edit / post ids |

## Promotion rule
Same kind of edit made 3+ times across clips (e.g. always removing the first 2s, always switching
to 1:1) → create a `proposed` learned rule with the edits as evidence. Performance loop does the
same for repeated high/low scores (`docs/publishing.md`). User accepts → `active`, rejects →
`rejected` (don't re-propose the same rule). Edit-pattern detection is not built yet.

## Conflicts
A new/proposed rule that contradicts an active rule gets `conflicts_with = <other rule id>` and is
shown to the user with both rules side by side. Never auto-override; the user picks.

## Who reads it
- `brand_fit` step: active rules + profile → pass or `NeedsInput` question.
- `extract_clips`: rules guide clip choice and reasons.
- Editor agent: active rules in context; may only propose (`docs/agent.md`).
- Clip selection: unselected `clips` rows (kept after their files are deleted) are a negative
  signal for edit-pattern detection.
