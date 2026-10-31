---
covers:
  - apps/web/svelte.config.js
  - apps/worker/Dockerfile
  - scripts/deploy-worker.sh
last_updated: 2026-11-01
---
# Deploy

Two pieces, deployed separately, both pointing at the same hosted Supabase + R2:
- **Web** (SvelteKit, adapter-vercel) on Vercel: `https://clip-studio-pi.vercel.app`.
- **Worker** (`apps/worker` Docker image: job loop, render, publisher, cleanup, checkpoints) on a
  Google Cloud Compute Engine VM, always on (`scripts/deploy-worker.sh`).

Migrations are applied by the human/orchestrator with `npx supabase db push --include-all` from
main, never by agents. Deploy order for a release: migrations → worker → web.

## Web on Vercel

### Env vars
Set in the Vercel project (Production; Preview too if you use previews). Meanings: `docs/env.md`.

| Var | Notes |
|---|---|
| `PUBLIC_SUPABASE_URL` | |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | |
| `SUPABASE_SECRET_KEY` | secret |
| `ENCRYPTION_KEY` | secret; same value as the worker, or saved keys can't be decrypted |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | secret; bucket CORS must allow the Vercel origin (checklist below) |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | secret; same OAuth client as the worker |
| `YOUTUBE_REDIRECT_URI` | `https://clip-studio-pi.vercel.app/settings/youtube/callback` |
| `DEMO_ALLOWED_EMAILS` | optional; empty disables the demo keys (ADR 0008) |
| `ACCESS_CODES` | secret; optional judge codes (`docs/auth-and-keys.md`). Judge accounts use the demo keys, so set `GEMINI_API_KEY` / `GROQ_API_KEY` too |
| `DEMO_DAILY_JOB_LIMIT` | optional; default 10 |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | secret; shared demo keys, only needed with `DEMO_ALLOWED_EMAILS` |

**Never set `DEV_LOGIN` (or `DEV_LOGIN_EMAIL` / `DEV_LOGIN_PASSWORD`) or `YOUTUBE_FAKE` on
Vercel.** Production builds ignore them (`dev` is false), but they must not exist there. No AI
provider key other than the two demo keys belongs in Vercel: users bring their own.
`SKIP_ONBOARDING` is gone (plan 10 removed the bypass): **delete it from the Vercel project.**

### Function duration
`svelte.config.js` sets `maxDuration: 60` for every function. The longest route is the editor
agent (`POST /api/editor/agent`, SSE): up to three LLM calls (understand, plan, one re-plan), each
with up to two rate-limit retries, usually 5-30 s. 60 s is allowed on every plan: on Hobby,
legacy (non-Fluid) functions default to 10 s with a 60 s max, while Fluid compute (the default for
new projects) allows up to 300 s. SSE streams fine on the Node runtime. If a stream is cut at the
limit, the chat shows "The agent took too long…" instead of hanging. To give it more room on Fluid
compute, raise `maxDuration` (≤ 300 on Hobby). Other AI calls (captions, recommendations,
onboarding rules, voice, learn) are single requests well under 60 s.

### Deploying
Current working path (CLI, prebuilt; what production runs today), from `apps/web`:
```sh
vercel pull --yes --environment production && vercel build --prod && vercel deploy --prebuilt --prod
```
A plain `vercel deploy` from `apps/web` fails: only that folder is uploaded, so `npm install`
can't resolve `workspace:*` (`@clip-studio/timeline-schema`) and there's no pnpm lockfile.
To make git / remote builds work (one-time, in the Vercel dashboard → Project → Settings):
1. **Build and Deployment → Root Directory** = `apps/web`, and keep "Include files outside the
   root directory in the Build Step" **on** (the workspace packages and `pnpm-lock.yaml` live at
   the repo root).
2. Framework preset SvelteKit; leave Install/Build commands on auto. Vercel sees the root
   `pnpm-lock.yaml` and runs `pnpm install` for the workspace. To use the exact pnpm from the root
   `packageManager` field, add env var `ENABLE_EXPERIMENTAL_COREPACK=1`.
3. Connect the Git repo (Settings → Git) for push-to-deploy, or deploy from the **repo root** with
   `vercel deploy --prod` (the project's Root Directory then picks `apps/web`).
4. Check the first remote build's log shows pnpm (not npm) installing the workspace. Keep the
   prebuilt command above as the fallback.

## Worker on a Google Cloud VM

### Sizing
| | e2-micro (free tier) | **e2-medium (recommended)** | e2-standard-2 |
|---|---|---|---|
| vCPU / RAM | 2 shared (~0.25 sustained) / 1 GB | 2 shared (bursts to 2) / 4 GB | 2 / 8 GB |
| Fits | short demo videos only, with 2-4 GB swap | demo + real 10-60 min videos | heavier use |

What the worker needs: the image is ~1.3 GB (Python, FFmpeg, 83 MB ONNX model, fonts). Peak RAM
is the job thread (onnxruntime session ~300 MB while `nsfw_check` streams frames, or an FFmpeg
clip cut) plus the render thread (FFmpeg 1080×1920 libx264 + libass, ~300-600 MB) plus the
publisher (reads a whole render into memory, tens of MB): plan on **~1.5 GB peak**, so 4 GB with
2 GB swap is comfortable and 1 GB only survives with swap and one thing at a time. CPU: the NSFW
check is ~0.3 s per frame per core (1 frame/s of video), so a 60-min video spends ~15-20 min there
on e2-medium and far longer on a throttled e2-micro. Disk: **30 GB** boot disk (OS ~3 GB + image +
build cache ~4 GB + swap; videos stream from R2 and temp files are deleted). Keep
`WORKER_CONCURRENCY=1` (default). No inbound ports: the worker only makes outbound connections
(Supabase, R2, AI providers, Google).

### Create the VM (you run this)
```sh
gcloud compute instances create clip-studio-worker \
  --zone=us-central1-a --machine-type=e2-medium \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-balanced
```
(For the free tier: `--machine-type=e2-micro --boot-disk-type=pd-standard` in us-west1,
us-central1 or us-east1, and `SWAP_GB=4` below.)

### Worker env
Production values for `apps/worker/.env` (template `apps/worker/.env.example`, meanings in
`docs/env.md`): Supabase URL + secret key + `DATABASE_URL`, `ENCRYPTION_KEY` (same as Vercel), R2,
`YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` (same client as Vercel), demo allowlist + demo keys
(same as Vercel, or empty). **No `YOUTUBE_FAKE`** (the script refuses it).

### Switch the worker from the laptop to the VM
Only one worker may run against production: two would race on the render loop (it re-queues
`rendering` clips on start) and double the load.
1. **Stop the laptop worker** first: in the main checkout `docker compose stop worker` (or stop
   `pnpm worker`), and kill any `uv run python main.py`. Check `docker ps` shows no worker.
2. From the repo root on main (the committed HEAD is what ships):
   ```sh
   ENV_FILE=apps/worker/.env scripts/deploy-worker.sh push clip-studio-worker us-central1-a
   ```
   It asks you to confirm step 1, copies `apps/worker` + `docker-compose.yml` to `~/clip-studio`
   on the VM (plus the env file if `ENV_FILE` is set; otherwise the first run creates `.env` from
   the template and stops so you can fill it in over `gcloud compute ssh`), then runs `setup`
   there: installs Docker (get.docker.com) once, adds a 2 GB swapfile (`SWAP_GB`), checks `.env`,
   `docker compose build worker` and `docker compose up -d worker`.
   Alternative: `git clone` the repo on the VM and run `bash scripts/deploy-worker.sh setup`
   there (it `git pull`s on later runs).
3. Logs: `gcloud compute ssh clip-studio-worker --zone us-central1-a --command 'cd ~/clip-studio && sudo docker compose logs -f worker'`.
   Expect `worker up: concurrency=1` and no claim errors.
4. Updates: re-run step 2. Rollback: check out the previous commit and re-run it.
   `restart: unless-stopped` (docker-compose.yml) brings the worker back after a crash or reboot.
5. Back to the laptop: `sudo docker compose stop worker` on the VM first.

## Production checklist (you do these; prod domain `https://clip-studio-pi.vercel.app`)
1. **Supabase** → Authentication → URL Configuration: Site URL
   `https://clip-studio-pi.vercel.app`; Redirect URLs include
   `https://clip-studio-pi.vercel.app/auth/callback` (plus `http://localhost:5173/auth/callback`,
   5174, 5175 for local).
2. **Google OAuth client used for login** (Supabase Google provider): Authorized redirect URI is
   Supabase's `https://<project-ref>.supabase.co/auth/v1/callback`; Authorized JavaScript origin
   `https://clip-studio-pi.vercel.app`.
3. **Google OAuth client for YouTube** (`YOUTUBE_CLIENT_ID`, may be the same client): Authorized
   redirect URIs `https://clip-studio-pi.vercel.app/settings/youtube/callback` and
   `http://localhost:5173/settings/youtube/callback`; YouTube Data API v3 and YouTube Analytics
   API enabled in that Google Cloud project.
4. **OAuth consent screen**: scopes `youtube.upload`, `youtube.readonly`,
   `yt-analytics.readonly` (+ login's email/profile); while the app is in Testing, add every
   tester's Google account under **Test users** (unverified apps post videos as private).
5. **R2 bucket CORS** (Cloudflare → R2 → bucket → Settings → CORS): AllowedOrigins
   `https://clip-studio-pi.vercel.app`, `http://localhost:5173` (and 5174/5175 if used),
   AllowedMethods `PUT, GET, HEAD`, AllowedHeaders `*`, ExposeHeaders `ETag`.
6. **Vercel**: env vars above; delete `SKIP_ONBOARDING`; deploy.
7. **Worker**: VM up, laptop worker stopped (section above).
8. Smoke test with a fresh account: README "Demo script".
