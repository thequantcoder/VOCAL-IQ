# PARITY 07 — Broadcast / Platform-Wide Announcements  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`.

## Prerequisites (admin)
- None.

## Context to load
- CLAUDE.md · golden rule #1 (super-admin spans tenants — the ONE legitimate cross-tenant write, via the admin client, audited)
- Day 55 super-admin + the `Notification` model
- `docs/COMPETITOR-FEATURE-ANALYSIS.md` delta #7

## Objective
Let a **super-admin** publish a **platform-wide announcement** (maintenance, new feature, outage) that every tenant sees in-app (banner + notification center), with targeting (all / by plan / by reseller), scheduling, and audience read-tracking.

## Step-by-step build
1. Data: `Announcement` (title, body, severity, audience filter, startsAt/endsAt, createdBy) + fan-out to `Notification` per tenant/user (or a join-on-read view). RLS so tenants only read announcements targeted to them.
2. API: super-admin CRUD (RBAC = platform admin only), publish/schedule, dismiss (per user). Cross-tenant fan-out uses the admin client + is `AuditLog`-recorded.
3. Web: super-admin composer + audience picker; tenant-side banner + notification-center entry with dismiss.
4. Tests: audience targeting (a tenant only sees theirs), RBAC (non-admin can't publish), schedule window, dismiss persists, audit recorded.

## Definition of Done
- [ ] Super-admin can broadcast targeted, scheduled announcements; tenants see + dismiss them; RBAC + audit + tenant-visibility correct; tests pass.

## Self-audit focus
Full A–K. Special attention: **B (tenants only see targeted announcements), C/RBAC (platform-admin-only publish), J (audit of the cross-tenant fan-out).**

## Commit plan
`feat(api,web): platform-wide broadcast announcements [parity-07]` — branch `parity/07-broadcast` → PR → CI → merge.

## Report to admin
Broadcast announcements live. Next: PARITY-08 promo credits.
