---
covers:
  - apps/web/src/routes
last_updated: 2026-10-31
---
# Product spec (condensed)

**Clip Studio** — a content repurposing studio with brand memory. A creator uploads a long
video (incl. video podcasts); the system finds short clips *with reasons*, the creator edits
them, then posts or schedules them. It learns from edits and from real performance.

## Pages
Onboarding, Home, Queue, Clip Picker, Editor, Publish, Calendar, Brand Memory, Settings.
Details per page: `docs/product/pages.md`.

## Core rules
- **Queue**: job states `pending | processing | needs_input | done | stopped | failed`.
  Pending jobs can be reordered; processing jobs can be stopped; the worker checks for stop
  between steps. → `docs/queue.md`
- **Pipeline**: transcribe → NSFW check (hard block) → brand-fit check (soft; may pause the job
  as `needs_input`) → clip extraction with reasons → source video deleted. → `docs/pipeline.md`
- **Editor**: every edit (manual UI or agent) mutates a **timeline JSON**. Video is only rendered
  by the worker with FFmpeg on save. → `docs/timeline.md`
- **Editor agent**: runs in SvelteKit server routes, plans multi-step requests as a todo list,
  tools are pure functions on the timeline, may only *propose* memory updates. → `docs/agent.md`
- **Voice input** (Wispr Flow) only in the editor chat; typing always works.
- **Brand memory**: stated rules (onboarding) vs learned rules (3+ repeated edits). Conflicts are
  surfaced to the user, never silently overridden. → `docs/brand-memory.md`
- **Publishing**: YouTube only (posted *private* while the Google app is unverified). Captions
  generated for youtube/instagram/linkedin/x; only YouTube auto-posts, others are copy-only.
- **Scheduler + checkpoints** at 48h, 7d, 14d, 30d run as a loop in the worker.
  Score = views / creator's median views at the same checkpoint. Repeated patterns → proposed
  rules. → `docs/publishing.md`
- **Export ratios**: 9:16 (Shorts, Reels, TikTok), 1:1 (Instagram feed, LinkedIn, X),
  16:9 (YouTube, LinkedIn, X).
- **BYOK**: users supply Anthropic, transcription (Deepgram/AssemblyAI/Groq) and optional Wispr
  keys. Encrypted (AES-GCM, server secret), never returned to the browser (last 4 only),
  validated on save. → `docs/auth-and-keys.md`

## Out of scope (for now)
Auto-posting to anything but YouTube; team accounts; billing.
