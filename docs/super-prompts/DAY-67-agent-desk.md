# DAY 67 — Agent Desk (Human-Agent Surface for Transfers & Escalations)  🧠 OPUS

> **Sequencing note:** logically this belongs **right after Day 27 (Squads/transfers)** — the Transfer node (Day 21) and warm/cold human handoff need a real destination. It is numbered 67 only to avoid renumbering the existing plan. **Recommended:** build it as soon as you finish Phase 2 (i.e. slot it around Day 27–30), not at the very end. Wherever you run it, follow the daily loop in `CLAUDE.md §2`.

## Prerequisites (admin)
- Days 9 (live loop), 11 (inbound), 21 (transfer node), 27 (Squads) ideally complete.
- No new third-party credentials (uses existing LiveKit + Socket.IO + auth).

> If a prerequisite day isn't done, build the Agent Desk against a stubbed transfer trigger and wire it fully once Day 21/27 land.

## Context to load
- `CLAUDE.md`
- `ARCHITECTURE.md` (live call flow, realtime transport)
- `DATA-MODEL.md` (Call, Membership role=AGENT, Notification)
- Blueprint §7.2 (Agent Desk panel), §3.1 (warm/cold transfer)
- `CODING-RULES.md` (#10 UI, security)

## Objective
Build the **Agent Desk** — the surface where human agents (Membership role `AGENT`) receive transferred/escalated live calls, see full caller context, and take over the conversation. This is the blueprint's fifth panel and the real destination for every "transfer to human" path. Without it, the Transfer node has nowhere to go.

## Step-by-step build
1. **Presence & availability:** human agents set themselves available/away/busy; track presence via Socket.IO (tenant-namespaced); a routing pool of available agents per tenant/skill.
2. **Transfer routing:** when a call's Transfer node (or an agent-initiated escalation) fires a human handoff, route it to an available human agent (round-robin / skill-based / specific-agent); ring/notify them; handle no-answer → fallback (queue, voicemail, another agent, or back to AI).
3. **Warm vs cold handoff:** warm = AI speaks a spoken context summary to the human before connecting; cold = immediate connect. Pass the live transcript + lead/contact context + AI summary so far.
4. **Live call takeover UI:** the human joins the LiveKit room (replacing or alongside the AI); live transcript streaming, caller info panel (contact, lead score, history, memory), call controls (mute, hold, transfer again, end, add notes).
5. **Whisper / assist mode (optional but valuable):** AI can suggest responses or surface KB answers to the human in real time (an "AI copilot" sidebar) without speaking to the caller.
6. **Disposition & wrap-up:** after the call, the human tags disposition, adds notes, updates the lead; feeds the same analytics + cost pipeline (human-handled minutes still metered for telephony cost).
7. **Queue & SLA view:** waiting transfers, wait times, who's handling what; supervisor view for ADMIN/OWNER.
8. **Tests:** presence updates, routing (round-robin + skill + no-answer fallback), warm-summary delivery, human join/takeover, disposition write-back, tenant isolation of the desk + queue, RBAC (only AGENT+ can claim calls).

## Definition of Done
- [ ] Human agents set availability and receive routed transfers from the Transfer node / escalations.
- [ ] Warm + cold handoff both work, with full context (transcript, lead, AI summary) passed.
- [ ] Human can join the live call, see live transcript + caller context, and use call controls.
- [ ] Disposition/notes write back to the call + lead and feed analytics + cost.
- [ ] Queue/SLA + supervisor view present; presence + routing tenant-scoped + RBAC-gated.
- [ ] Tests pass (routing, handoff, takeover, isolation, RBAC).

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **B (presence/queue/routing tenant-scoped), C (RBAC — only AGENT+ claims calls; no cross-tenant call access), F (handoff latency — no awkward gap), A (warm-summary correctness + no-answer fallback).**

## Commit plan
`feat(web,voice,api): Agent Desk — human transfer/escalation surface (Day 67/slot ~27)` — branch `day/67-agent-desk` → PR → CI green → merge. Update `PROMPT-INDEX.md` to reflect where you actually ran it.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Closes the blueprint's 5th panel: human agents can now take over AI calls with full context. Recommend running this before launch-readiness if you skipped it earlier — many real deployments need human escalation on day one.
