# VocalIQ — API & SDK Guide

## Auth
Two modes:
- **Session JWT** (dashboard/mobile): `Authorization: Bearer <jwt>` + `x-tenant-id: <tenant>`.
- **API keys** (server-to-server): scoped keys under **Developers**; send `Authorization: Bearer <apiKey>`
  to the metered, rate-limited `/v1/*` public API.

## Core endpoints (v1)
- `POST /v1/calls` — place an outbound call (agentId, to, consentBasis).
- `GET  /v1/calls/:id` — call detail + transcript + cost.
- `GET  /v1/agents` — list agents.
- `POST /v1/leads` — capture a lead.

## Webhooks
Subscribe to `call.completed`, `lead.captured`, etc. Every delivery is **HMAC-signed**; verify the
signature (see `packages/shared` messaging/webhook helpers) before trusting the payload.

## Status
`GET /status` — public, unauthenticated platform status.
