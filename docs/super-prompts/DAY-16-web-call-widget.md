# DAY 16 — Web-Call Widget (Browser WebRTC) + Click-to-Call  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- LiveKit keys; Day 9 loop.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- DESIGN-SYSTEM.md (visual identity, motion, UX, senior-FE floor)
- CLAUDE.md
- ARCHITECTURE.md (realtime transport)
- packages/ui
- DATA-MODEL.md (Call channel=WEB)

## Objective
> 🎨 **Design direction:** Widget UI follows DESIGN-SYSTEM.md (waveform, live captions, themeable via tenant tokens).

Let visitors talk to an agent over WebRTC with no phone number: embeddable widget + click-to-call into the same loop, tenant-scoped + themeable.

## Step-by-step build
1. Embeddable widget (script/iframe) opening a LiveKit session to a tenant agent; mic permission, mute, end, live captions.
2. Tenant-scoped, rate-limited token endpoint for widget sessions.
3. Reuse Day 9 loop for WEB channel; persist Call(channel=WEB)+transcript+cost.
4. Theming via tenant branding (prep white-label Day 52).
5. Tests: token authz + rate limit, session lifecycle, web call recorded + costed.

## Definition of Done
- [ ] Visitor talks to an agent in-browser; call recorded + costed.
- [ ] Widget themeable + tenant-scoped + rate-limited.
- [ ] Tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (token authz/rate limit) + B + F (latency parity).**

## Commit plan
`feat(web,voice): browser web-call widget + click-to-call (Day 16)` — branch `day/16-web-call-widget` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Phase 1 complete. Tag v0.2-phase1. Next: the visual builder.
