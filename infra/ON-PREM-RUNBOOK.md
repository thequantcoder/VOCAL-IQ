# VocalIQ — On-Premise / Single-Tenant VPC Deployment Runbook (Day 61)

A guide to deploying an **isolated, region-pinned, zero-egress** VocalIQ stack for a regulated or
enterprise buyer. Each tenant gets a dedicated VPC — no shared data plane, no cross-region egress.

## 1. Prerequisites (admin)
- Terraform ≥ 1.6, credentials for the target cloud (AWS module provided; GCP/Azure analogues follow the same shape).
- A chosen **data region** from the supported set (see `packages/shared/src/residency.ts` → `DATA_REGIONS`).
- A secrets backend (AWS Secrets Manager / Vault / Doppler) holding: `DATABASE_URL`, `APP_JWT_SECRET`, `VAULT_MASTER_KEY`, and any provider keys the tenant supplies.
- Enterprise requirement confirmed (single-tenant isolation is materially more expensive than shared multi-tenant).

## 2. Provision the isolated stack
```bash
cd infra/terraform/single-tenant-vpc
terraform init
terraform plan  -var tenant_slug=acme -var data_region=eu-west-1
terraform apply -var tenant_slug=acme -var data_region=eu-west-1
```
This creates: an isolated VPC, private subnets, an encrypted single-tenant Postgres 16, Redis, and a
private S3 bucket — all pinned to `data_region`. **Egress is off by default** (no NAT/IGW) so tenant
data cannot leave the VPC; set `-var enable_public_egress=true` only if the tenant needs outbound
provider calls from inside their VPC (they may instead BYO provider keys via a private endpoint).

## 3. Pin the app to the region
Set `DATA_REGION=<region>` in the app environment (api/voice/workers). This makes
`platformRegion()` resolve to that region, so `ResidencyService.resolve()` routes every tenant's
storage/voice to the in-region endpoints. In a single-tenant VPC, the tenant's residency is the
deploy region — no per-tenant override is needed, but the same `region` may be pinned in the
tenant's settings for defense-in-depth.

## 4. Migrate + seed
```bash
set -a && source .env && set +a
pnpm --filter @vocaliq/db exec prisma migrate deploy
pnpm --filter @vocaliq/db exec tsx prisma/seed.ts   # optional demo data
```

## 5. Deploy the services
Run api + voice + workers as containers in the private subnets (ECS/EKS/Nomad — orchestrator module
consumes the base `outputs.tf`: `database_endpoint`, `redis_endpoint`, `storage_bucket`). Front the
api with the provided Nginx config (`infra/nginx/vocaliq.conf.sample`) terminated at a private ALB.

## 6. Validate (zero-egress + residency)
- `terraform output zero_egress` → `true` (no IGW/NAT).
- Confirm the DB + bucket carry the `Residency = <region>` tag and live only in `data_region`.
- Hit `GET /residency` as a tenant admin → `region` + in-region `storageHost`/`voiceHost`.
- Smoke: create an agent, place a test call, verify the recording lands in the in-region bucket and
  no traffic egresses the VPC (VPC flow logs show no cross-region/public destinations).

## 7. Data residency guarantees
- **At rest:** DB + object storage are single-region, encrypted, single-tenant.
- **In processing:** voice infra is routed to the region's `voiceHost`; strict-egress tenants
  (`residencyPermits`) are refused processing outside their jurisdiction.
- **No shared data:** each tenant's VPC is fully isolated — a bug in one deployment cannot read
  another's data (there is no cross-tenant path at all).

## 8. Teardown
```bash
terraform destroy -var tenant_slug=acme -var data_region=eu-west-1
```
(DB `deletion_protection` is on — disable it deliberately before destroy, after exporting any
retained data per the tenant's retention policy.)
