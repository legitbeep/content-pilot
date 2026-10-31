# Clip Studio

A content repurposing studio with brand memory. Upload a long video (a talk, a tutorial, a video
podcast). Clip Studio transcribes it, checks it, and suggests short clips, each with a reason.
You edit the clips by hand or by asking an editor agent, then post them to YouTube or schedule
them. It learns your brand rules from your edits and from how the posts perform, and it always
asks before adopting a rule.

Live: https://clip-studio-pi.vercel.app (Google sign-in; the YouTube app is unverified, so
videos are posted as **private**).

## How it works
- **Web** (`apps/web`, SvelteKit 2 + Svelte 5, on Vercel): pages, auth, presigned uploads,
  BYOK keys, the editor and its agent (server routes), publishing UI.
- **Worker** (`apps/worker`, Python + FFmpeg in Docker, on a Google Cloud VM): claims jobs from
  a Postgres queue (`FOR UPDATE SKIP LOCKED`), runs the pipeline (probe → transcribe → NSFW check
  → brand fit → clip extraction), renders timelines, posts scheduled videos, collects metrics.
- **Supabase** (Postgres + Google login, RLS everywhere) and **Cloudflare R2** (video files).
- **Timeline JSON** (`packages/timeline-schema`) is the only way a clip changes: the editor and
  the agent edit JSON, and the worker renders it with FFmpeg.
- **AI on your own keys** (Groq, Gemini or Claude for LLM; Groq or Deepgram for transcription;
  optional Wispr Flow for voice). Keys are encrypted and never sent back to the browser.

Docs start at `docs/INDEX.md`; the product spec is `docs/product/spec.md`.

## Local setup
Needs Node 24, pnpm 11, Python 3.12 + uv, Docker, and ffmpeg (for worker tests).
```sh
pnpm install
uv sync --directory apps/worker
cp apps/web/.env.example apps/web/.env          # fill in Supabase, R2, ENCRYPTION_KEY, …
cp apps/worker/.env.example apps/worker/.env    # same project values (docs/env.md)
pnpm nsfw:model                                  # NSFW model for running the worker outside Docker
pnpm dev                                         # web on http://localhost:5173
pnpm worker                                      # worker in Docker
```
Only run **one** worker against a database at a time (see `docs/deploy.md`).
`pnpm check` (types, lint, docs, secrets) and `pnpm test` (vitest + pytest) must pass before a
change is done. Seed data for local testing: `pnpm seed:<editor|publish|clips|agent|performance>`
and the matching `:clean` scripts (dev users only).

## Deploy
Full steps and the production checklist (Supabase redirect URLs, Google OAuth redirect URIs, test
users, R2 CORS): `docs/deploy.md`.
1. Apply migrations: `npx supabase db push --include-all`.
2. Worker: stop any other worker, then from the repo root
   `ENV_FILE=apps/worker/.env scripts/deploy-worker.sh push clip-studio-worker us-central1-a`
   (creates nothing on GCP by itself: make the VM first with the `gcloud compute instances create`
   line in `docs/deploy.md`).
3. Web: set the Vercel env vars, then from `apps/web`
   `vercel pull --yes --environment production && vercel build --prod && vercel deploy --prebuilt --prod`.

## 3-minute demo script
Prepare: a Google account on the OAuth test users list, a Groq key (covers LLM + transcription),
a 5-10 min talking-head video on your topic, and a second short video that conflicts with your
brand (for example, cooking chicken for a vegan brand). Pre-upload both a few minutes ahead so the
pipeline has finished; show the live states on a third upload.

| Time | Show | Requirement covered |
|---|---|---|
| 0:00 | **Sign in with Google** → onboarding. Step 1: paste the Groq key (validated, saved encrypted, only the last 4 shown). | Google login, BYOK keys |
| 0:15 | Steps 2-7: name, audience, topics, "never cover: meat", tone, logo + caption font, CTA + hashtags. Step 8: **Connect YouTube** (optional). Step 9: rules written from your answers → edit one → **Looks right**. | Onboarding, stated brand rules, YouTube connect |
| 0:40 | **Home** → **Generate clips** → Queue. Upload the third video with a request ("3 clips about interviews"). Watch it go pending → processing with step + progress; drag to reorder pending jobs, press **Stop** on one and **Re-queue** it. | Queue states, reorder, stop, presigned upload |
| 1:00 | Open the conflicting video's job: **Needs input** with the brand-fit question → "Critique or contrast it". Mention the NSFW check: explicit videos are blocked and deleted, borderline ones ask with flagged times. | Brand-fit soft check, NSFW hard block |
| 1:15 | The finished job → **Open clips** (Clip Picker): clips ranked with hook, reasons, transcript excerpt. `J`/`K`, ✗ one with "Boring", select two with `X` → **Proceed with editing** (source + unselected clips are deleted). | Clips with reasons, 5 s handles, feedback, cleanup |
| 1:35 | **Editor**: trim, split (`S`), set 9:16 / 1:1 / 16:9, captions on. Then ask the agent: "make it vertical, lower the original audio to 20 percent, add my voiceover, then merge clip 2 at the end". The checklist ticks; **Undo plan** works. Hold `V` to say it instead (with a Wispr key). | Timeline JSON edits, editor agent multi-step plan, voice, export ratios |
| 2:05 | **Finish all clips** → renders (FFmpeg in the worker) with previews → **Go to publish**. **Generate captions** (YouTube, Instagram, LinkedIn, X; only YouTube posts, others copy). **Schedule** 2 minutes ahead → toast → **Open calendar**. | Render on save, captions for 4 platforms, YouTube scheduling |
| 2:30 | **Calendar**: the scheduled post (month + table view, reschedule/cancel). It flips to posted (private) after the worker's publisher runs. | Scheduler, calendar |
| 2:40 | **Brand memory** → Learned from you: a rule proposed from repeated edits (3+) and a conflict card ("Keep mine / Update rule"). Nothing becomes active until you tick it. **Home**: checkpoints at 48h/7d/14d/30d, score = views / your median, "What we learned" cards. | Learned rules, conflicts surfaced, performance learning |
| 2:55 | Settings: keys, default provider, usage. Limits: 60 min per video, 5 videos a day, 2 processing at once. | Settings, usage caps |
