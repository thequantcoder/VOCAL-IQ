# DAY 07 — Provider Router Core — TTS/STT/Telephony Adapters  🧠 OPUS  ·  *(may take 2 sessions)*

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- DEEPGRAM_API_KEY (STT).
- ELEVENLABS_API_KEY (TTS).
- TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER.
- LIVEKIT_URL/API_KEY/API_SECRET.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- ARCHITECTURE.md (router, realtime transport)
- TECH-STACK.md
- DAY-06 output

## Objective
Complete the router: streaming TTS (ElevenLabs), streaming STT (Deepgram), Telephony (Twilio) + media (LiveKit) behind one interface, with routing, fallback, cost metering — mirrored in the Python voice service.

## Step-by-step build
1. Interfaces: TTSProvider{synthesizeStream}, STTProvider{transcribeStream}, TelephonyProvider{dial,answer,transfer,hangup}.
2. Implement ElevenLabs TTS (stream, voice settings), Deepgram STT (stream, partials), Twilio telephony, LiveKit media/rooms.
3. Extend Router: selectTTS/STT/Telephony with language- + latency-aware selection + fallback; BYOK vs managed; UsageRecord per call (per-second/char pricing).
4. Python mirror in apps/voice/providers/ matching the TS contract.
5. Per-provider price table + costOf(usage) util shared with the cost engine (Day 13).
6. Tests: contract per adapter (mocked + one sandbox smoke each), selection per capability, fallback, cost math.

## Definition of Done
- [ ] TTS/STT/Telephony/media adapters pass contract tests.
- [ ] Router selects per capability + fallback + metering.
- [ ] Python mirror matches TS contract.
- [ ] Sandbox smoke: synth speech, transcribe clip, create LiveKit room, place Twilio test call.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **D + F (streaming) + B. Verify fallback when a provider key is invalid.**

## Commit plan
`feat(router): TTS/STT/telephony/media adapters + python mirror (Day 7)` — branch `day/07-provider-router-core` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Router complete. Next: voice service skeleton + media bridge.
