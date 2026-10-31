---
covers: []
last_updated: 2026-10-31
---
# Glossary

- **Job** — one uploaded long video moving through the pipeline. Row in `jobs`. `docs/queue.md`
- **Step** — one pipeline stage (`apps/worker/pipeline/<step>.py`). Idempotent.
- **Needs input** — job paused by `brand_fit` waiting for the user's answer; releases the worker slot.
- **Clip** — a candidate short cut from a job, with a `reason`. Row in `clips`, own file in R2.
- **Clip file** — `clips/<clip_id>/source.mp4`: the candidate cut from the source with handles.
  Timeline times are relative to it.
- **Handles** — the 5s of extra footage before and after a clip in its clip file, so trims can extend.
- **Word slice** — `clips.words`: transcript words inside the clip file, times relative to it.
- **Cleanup** — deleting the source + unselected clip files after "Proceed with editing" or 48h.
- **Timeline** — JSON describing how a clip is edited (segments, aspect, captions, overlays).
  The only way to change a clip. `docs/timeline.md`
- **Render** — worker turning a timeline revision into a video file in R2.
- **Revision** — `timelines.revision`; bumps on save; render is stale when `rendered_revision` < it.
- **Rule** — one brand memory statement. **Stated** (user-given) or **learned** (from edits or
  performance). **Proposed** until the user accepts. `docs/brand-memory.md`
- **Proposal** — a suggested rule/memory change awaiting user approval. Agents only propose.
- **Conflict** — two rules that contradict; surfaced to the user, never auto-resolved.
- **Post** — one clip + caption for one platform. Only YouTube auto-posts.
- **Checkpoint** — fixed time after posting when metrics are captured: 48h, 7d, 14d, 30d.
- **Baseline** — creator's median views at a given checkpoint over their 20 most recent samples
  (own posts + seeded channel videos). Needs 5+ samples.
- **Score** — views / baseline at the same checkpoint. 1.0 = typical.
- **BYOK** — bring your own key: users supply provider API keys, stored encrypted.
- **Aspect / export ratio** — 9:16, 1:1, 16:9.
