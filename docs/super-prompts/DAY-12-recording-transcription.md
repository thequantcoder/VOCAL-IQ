# DAY 12 — Recording -> R2 + Streaming Transcription Storage  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- R2 bucket + R2_* keys.
- Confirm recording-consent policy/region defaults.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- DATA-MODEL.md (Call, Transcript)
- CODING-RULES.md (PII)
- ARCHITECTURE.md (stores)

## Objective
Record every call (consent-permitting) to R2, store the live transcript with diarization, provide secure tenant-scoped playback synced to transcript.

## Step-by-step build
1. Capture call audio -> upload to R2 under tenant-namespaced path; store signed recordingUrl.
2. Persist transcript segments (from Day 9) with diarization + timestamps.
3. Consent/disclosure: respect per-region rules; skip/anonymise where required; redact obvious PII.
4. Signed-URL playback endpoint (RBAC + tenant + short expiry).
5. Retention hooks (full policy Day 60).
6. Tests: tenant-namespaced path, signed-URL authz, transcript persistence, consent-skip path.

## Definition of Done
- [ ] Recordings in R2 (tenant-scoped) with secure playback.
- [ ] Transcripts with diarization + timestamps.
- [ ] Consent/redaction respected; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (PII, signed-URL authz) + B + G.**

## Commit plan
`feat(voice,api): recording to R2 + transcription storage (Day 12)` — branch `day/12-recording-transcription` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Recordings + transcripts captured. Next: cost-attribution engine (critical).
