# DAY 09 — Live Call Loop — Streaming STT->LLM->TTS, Turn-Taking, Barge-In  🧠 OPUS  ·  *(may take 2 sessions)*

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 7-8; STT/TTS/LLM keys.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md (golden rules)
- ARCHITECTURE.md (call flow)
- CODING-RULES.md (#8 latency)
- DATA-MODEL.md

## Objective
Implement the core real-time pipeline in Pipecat: caller audio -> STT partials -> LLM (stream, tools-ready) -> TTS chunks -> caller, with turn-taking/endpointing, barge-in, backchanneling — meeting latency targets.

## Step-by-step build
1. Pipecat pipeline: STT (Deepgram stream) -> context manager -> LLM (router, streaming) -> TTS (router, sentence-chunked) -> playback.
2. Turn-taking: configurable endpointing/VAD with per-agent turnTimeoutMs.
3. Barge-in: caller speech interrupts agent TTS cleanly (cancel in-flight, flush, listen).
4. Backchanneling/fillers during tool/LLM latency.
5. Stream events to clients: partial transcripts, agent speaking, interruption, turn changes.
6. Persist transcript segments live; attach per-component usage (to cost engine Day 13).
7. Instrument time-to-first-audio + turnaround; expose metrics.
8. Tests: simulated-audio integration test (fixture wav) for a full turn; barge-in; endpointing; latency assertion.

## Definition of Done
- [ ] A real call holds natural back-and-forth; interruptions handled.
- [ ] TTFA < ~800ms, turnaround < ~1.5s locally.
- [ ] Transcript persisted live; events streamed; usage captured.
- [ ] Tests (incl. simulated convo) pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **F (latency — make/break) + D (usage) + A (turn logic) + B.**

## Implementation detail & gotchas (read before coding)
- **Use `CODE-PATTERNS.md §9** (voice loop shape) and `§2` (router calls) verbatim.
- **Latency budget (measure each):** STT partial < 150ms; LLM time-to-first-token < 400ms; TTS time-to-first-audio < 300ms; total caller-perceived turnaround < 1.5s. Log each segment per turn.
- **Barge-in is the #1 naturalness factor.** On caller voice-activity during agent speech: immediately cancel the in-flight TTS stream, flush the audio buffer, discard the half-spoken LLM turn (or mark it interrupted), and switch to listening. Test this explicitly — a laggy or missed barge-in makes the agent feel robotic.
- **Endpointing trade-off:** too eager = cuts people off; too slow = dead air. Make it `agent.turnTimeoutMs`-driven with VAD; default ~700ms silence. Add a small "still there?" backstop for long silences.
- **Backchannel during tool/LLM latency:** play a short filler ("let me check that…") if the next audio will take >1.2s, so silence never feels broken.
- **Streaming TTS chunking:** chunk LLM output at sentence/clause boundaries so TTS starts before the full response is generated. Don't wait for the whole LLM completion.
- **Context management:** keep the rolling conversation context trimmed (token budget) so LLM latency + cost stay bounded on long calls.
- **Persist transcript segments incrementally** (don't buffer the whole call in memory) and attach a `UsageRecord` per provider call (`CODE-PATTERNS.md §3`).
- **Common failure modes to handle:** provider stream drops mid-turn (reconnect/fallback), caller silence/no-speech, overlapping speech, DTMF during speech, very long monologues.

## Acceptance tests (must exist + pass)
- [ ] Simulated-audio integration test drives a full multi-turn conversation end-to-end (fixture WAV in, expected behaviour out).
- [ ] Barge-in test: agent is speaking, caller speaks → agent stops within ~200ms and listens.
- [ ] Endpointing test: agent waits the configured silence, then responds; does not cut off a mid-sentence pause.
- [ ] Latency assertion test: TTFA and turnaround under target in the local harness.
- [ ] Provider-failure test: STT/LLM/TTS stream error → fallback/reconnect without dropping the call.
- [ ] Usage test: each turn emits STT+LLM+TTS UsageRecords attributed to the tenant + call.

## Commit plan
`feat(voice): real-time STT-LLM-TTS loop, turn-taking, barge-in (Day 9)` — branch `day/09-live-call-loop` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Heart of the product works. Next: outbound + voicemail.
