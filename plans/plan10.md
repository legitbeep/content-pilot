# Plan 10: Integration, polish, deploy

Wave 3 (all plans merged into main). Branch `feat/integration`, port 5173.
Read CLAUDE.md, docs/INDEX.md and every plans/handoff-*.md first. Plan mode first.

## Phase 1: Integration

1. Resolve every "known gap" and contract change listed in the handoff notes.
2. Wire the cross-plan links: onboarding gets an optional "Connect YouTube" step;
   Queue -> Clip Picker -> Editor -> Publish -> Calendar flows end to end; Home
   actions point to the right places.
3. Run the NSFW check on editor uploads (voiceover, music, extra clips).
4. Usage caps: max video length 60 min, max 5 jobs per user per day, max 2
   processing per user. Clear messages when hit.
5. Run every `seed:*:clean` script and confirm no seed rows or files remain.
6. Review all empty, loading and error states against design-system.md.

## Phase 2: Deploy

1. Web on Vercel (adapter-vercel): env vars, and check the function duration limit
   on the free plan against the agent's SSE route; adjust if needed.
2. Worker: same Docker image on an always-on free host (Oracle Cloud free VM
   preferred; Hugging Face Spaces as fallback, which needs a small health endpoint
   and sleeps when idle). Document both in docs/deploy.md.
3. Checklist for me: Supabase redirect URLs, R2 CORS origins, Google OAuth redirect
   URIs (login and YouTube) for the production domain, and test users on the OAuth
   consent screen.
4. README: what the product does, local setup, deploy steps, and a 3-minute demo
   script covering every requirement in docs/product/spec.md.

## Acceptance

- pnpm check and pnpm test pass on main.
- On the deployed URL, a fresh account completes: onboarding -> upload -> clips with
  reasons -> edit with the agent -> render -> schedule -> auto-post -> calendar.
- docs fully in sync (docs check passes).

## Cleanup from earlier waves

- Remove the TEMP onboarding bypass (`SKIP_ONBOARDING`, grep `TEMP(onboarding-bypass)`), its test, env example and docs, and unset it on Vercel.
