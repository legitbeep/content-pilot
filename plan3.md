# Phases E–G: API keys, upload + queue, worker transcription

Read CLAUDE.md, then docs/INDEX.md, and open only the docs it lists for: auth-and-keys,
queue, pipeline, data-model, env, design-system. Use plan mode and show the plan first.
Commit after each phase. Use the existing skills (add-migration, add-page,
add-pipeline-step, add-ui-component) and keep docs in sync.

## Phase E: Test runner + API keys (BYOK)

1. Add Vitest to apps/web and wire it into `pnpm test`. Add a test for formatTimecode.
2. Settings → API keys section. Providers: anthropic (required), deepgram (required),
   wispr (optional, labelled "Optional: voice input in the editor").
   - Save flow: validate with one cheap authenticated call -> encrypt -> store.
     Verify the cheapest validation call in each provider's current docs
     (e.g. a models or projects list endpoint). Wispr follows the rule already
     in docs/auth-and-keys.md (may be saved as "unverified").
   - Encryption: AES-256-GCM with ENCRYPTION_KEY. Define one storage format
     (e.g. base64(iv || ciphertext || tag)) used by BOTH web (WebCrypto) and worker
     (Python `cryptography` AESGCM). Add a cross-language test: a fixture encrypted
     in TS must decrypt in Python, and vice versa.
   - UI shows provider, status (valid / unverified / invalid), last 4 chars,
     validated date, and Replace / Remove actions. The full key is never sent
     back to the browser.
   - If required keys are missing, the Queue upload area shows an inline prompt:
     "Add your Anthropic and Deepgram keys to start." [Open settings]

## Phase F: Upload + Queue page

1. Upload flow:
   - Dropzone + file picker + optional "What should we look for?" textarea.
   - Client checks before upload: video/* only, max 2 GB, max 60 minutes (read
     duration from a <video> element's metadata). Clear error messages if rejected.
   - Server route creates the job row (status: uploading is NOT a state, so create
     the job only after the upload succeeds) and returns a presigned R2 PUT URL.
     Use a two-step flow: (a) get presigned URL + upload id, (b) browser PUTs the
     file directly to R2 with a progress bar, (c) confirm route creates the job as
     `pending` at the end of the queue.
   - Never send video bytes through SvelteKit.
2. Queue page (Linear-style list, not cards):
   - Row: thumbnail placeholder, file name, duration (Timecode), request snippet,
     StatusBadge, current step + progress when processing, created time.
   - Actions by state (match docs/queue.md exactly): pending -> drag to reorder,
     edit request, delete; processing -> stop; needs_input -> open question;
     done -> open clips (placeholder route for now); stopped -> re-queue, delete;
     failed -> retry, delete, show error.
   - Keyboard: J/K to move selection, Enter to open, Backspace to delete (with
     confirm). Add these to shortcuts.ts and the shortcut sheet.
   - Live updates: use Supabase Realtime on the jobs table if it works with the
     RLS setup; otherwise poll every 3s while any job is pending/processing.
   - Row click opens a details sheet: job info, step history, error, and (once
     available) a transcript preview with speaker labels and timecodes.
   - Empty state copy from design-system.md.
3. State transitions as a pure, tested function (allowed transitions table),
   used by both the server routes and documented in docs/queue.md.
4. Limits: max 2 jobs `processing` per user, enforced in the claim query.

## Phase G: Worker claiming + transcription

1. Claim loop: FOR UPDATE SKIP LOCKED, respect the per-user processing limit,
   global worker concurrency 1 (configurable via env). Update step + progress on
   the job as it runs. Check the stop flag between steps.
2. Failures: catch per step, set status `failed` with a user-readable error
   ("Deepgram rejected the API key. Update it in Settings.") plus the technical
   detail in a separate column for debugging. Retry re-runs from the failed step.
3. Probe step: ffprobe on a presigned GET URL to confirm duration, resolution and
   that an audio track exists. Fail clearly if there's no audio.
4. Transcribe step:
   - Decrypt the user's Deepgram key, call pre-recorded transcription with the
     presigned GET URL (verify current Deepgram params for word timestamps,
     diarization and smart formatting).
   - Save the full transcript JSON to R2 at transcripts/{job_id}.json and store
     the path on jobs.transcript_path (per docs/pipeline.md).
   - Normalise to our own format (words with start/end/speaker, utterances) so
     the rest of the pipeline never depends on Deepgram's shape. Document it in
     docs/pipeline.md and add a pydantic model + fixture test.
5. The remaining steps stay stubs: after transcription, mark the job `done` with
   a note "Clip extraction not built yet" so the end-to-end flow is testable.

## Acceptance
- pnpm check and pnpm test pass (web + worker + cross-language crypto test)
- With my real keys: upload a ~5 min video -> job appears as pending -> worker
  claims it -> progress updates live -> done -> details sheet shows the
  transcript with speakers and timecodes
- Stop works on a processing job; retry works on a failed job (test by saving
  an invalid Deepgram key)
- Final report: what I need to configure (R2, CORS, DATABASE_URL), anything
  unverified, and docs changed
