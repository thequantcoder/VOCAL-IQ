# DAY 61 — On-Premise/VPC Deployment + Data Residency  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Terraform; target cloud(s); enterprise requirement confirmed.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §5.2.5
- ARCHITECTURE.md (environments)
- infra/

## Objective
A single-tenant VPC / on-prem deployment option with zero data egress for regulated/enterprise buyers, plus per-tenant data residency (region pinning at rest + in processing).

## Step-by-step build
1. Terraform modules for an isolated single-tenant VPC deployment (api, voice, workers, DB, Redis, storage) with no shared data.
2. Data residency: per-tenant region pinning for DB/storage/processing; route voice infra to the right region.
3. Deployment runbook + config for self-host; secrets via the chosen vault.
4. Tests/validation: residency routing, isolation of a VPC deployment, smoke of full stack in a fresh region.

## Definition of Done
- [ ] VPC/on-prem deployable via Terraform with zero egress; residency pinning works; validated.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (isolation, egress) + B + K (IaC reproducibility).**

## Commit plan
`feat(infra): on-prem/VPC deployment + data residency (Day 61)` — branch `day/61-onprem-vpc-residency` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Enterprise deployment options ready. Next: scale infra.
