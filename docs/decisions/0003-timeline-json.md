---
covers:
  - packages/timeline-schema
last_updated: 2026-10-31
---
# 0003 — Timeline JSON as the only edit surface

**Status:** accepted

**Context.** Both a manual editor and an LLM agent edit clips. Rendering video in the browser or
on Vercel is slow and fragile.

**Decision.** Every edit produces a new timeline JSON (JSON Schema is the source of truth,
mirrored in zod and pydantic, tested against shared fixtures). The worker renders with FFmpeg on save.

**Consequences.** Agent tools are pure, testable functions. Undo/history is just revisions.
Previews in the editor must be approximated client-side (player seeking + CSS overlays) until a
render exists. Three mirrors must be kept in sync (`.claude/rules/timeline.md`).
