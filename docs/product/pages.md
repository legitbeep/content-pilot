---
covers:
  - apps/web/src/routes
last_updated: 2026-10-31
---
# Pages

All are placeholders (title + TODO) today. Route → purpose / data / actions.

| Route | Page | Purpose | Data (tables) | Actions |
|---|---|---|---|---|
| `/onboarding` | Onboarding | Capture stated brand rules | `brand_profile`, `brand_rules` (source=stated) | Answer brand questions, paste example posts |
| `/` | Home | Overview + next steps | `posts`, `post_metrics`, `jobs` | CTAs: **Generate clips** (→ upload → `/queue`), **Recommended long-form videos** |
| `/queue` | Queue | Ingestion jobs | `jobs` | Upload (presigned R2), reorder pending, stop processing, answer `needs_input`, retry failed |
| `/clips` | Clip Picker | Review clips of a finished job, with reasons | `clips`, `timelines`, `jobs` | Select clips (`clips.selected`), **Proceed with editing** (sets `jobs.proceeded_at` → source + unselected clip files deleted; otherwise after 48h) |
| `/editor` | Editor | Edit one clip | `timelines`, `brand_rules` | Manual timeline edits, agent chat (+ Wispr voice), pick export ratio, save → render |
| `/publish` | Publish | Post or schedule a rendered clip | `posts`, `platform_connections_public` | Generate captions (4 platforms), post to YouTube (private), copy others, schedule |
| `/calendar` | Calendar | Scheduled + posted content | `posts`, `post_metrics`, `baseline_seeds` | Calendar view, table view, details modal, reschedule |
| `/brand` | Brand Memory | See/curate rules | `brand_rules`, `brand_profile` | Accept/reject proposed rules, resolve conflicts, edit stated rules |
| `/settings` | Settings | Keys + platforms | `user_keys_public`, `platform_connections_public` | Save/validate BYOK keys (last 4 shown), connect/disconnect YouTube |

Expected params later: `/clips?job=<id>`, `/editor?clip=<id>` (or `[id]` segments — decide when built).
