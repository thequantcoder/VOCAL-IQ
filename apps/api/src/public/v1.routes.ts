import { buildOpenApiSpec } from '@vocaliq/shared';
import { Router } from 'express';
import type { AgentsService } from '../agents/agents.service';
import { apiKeyAuth, requireScope } from '../api-keys/api-key.middleware';
import type { ApiKeyService } from '../api-keys/api-key.service';
import type { CallsReadService } from '../calls/calls-read.service';
import type { OutboundService } from '../calls/outbound.service';
import { ah } from '../http/async-handler';
import type { LeadsService } from '../leads/leads.service';

/**
 * Public REST API v1 (Day 48). API-key authenticated (per-key rate-limited + metered), scope-
 * gated, RLS-scoped to the key's tenant. Reuses the same services the dashboard uses, so the
 * public surface can never diverge from — or exceed — the internal one. Self-describing via
 * `/v1/openapi.json`.
 */
export function v1Routes(deps: {
  keys: ApiKeyService;
  agents: AgentsService;
  callsRead: CallsReadService;
  outbound: OutboundService;
  leads: LeadsService;
}): Router {
  const r = Router();

  // OpenAPI is public (no key) so tooling can discover the API.
  r.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiSpec());
  });

  // Everything else requires a valid API key.
  r.use(apiKeyAuth(deps.keys));

  r.get(
    '/whoami',
    requireScope('agents:read'),
    ah(async (req, res) => {
      res.json({ tenantId: req.ctx!.tenantId, scopes: req.apiScopes ?? [] });
    }),
  );

  r.get(
    '/agents',
    requireScope('agents:read'),
    ah(async (req, res) => {
      res.json(await deps.agents.list(req.ctx!.tenantId));
    }),
  );

  r.get(
    '/calls',
    requireScope('calls:read'),
    ah(async (req, res) => {
      res.json(await deps.callsRead.list(req.ctx!.tenantId, req.query));
    }),
  );

  r.post(
    '/calls',
    requireScope('calls:write'),
    ah(async (req, res) => {
      res.status(201).json(await deps.outbound.placeCall(req.ctx!.tenantId, req.body));
    }),
  );

  r.get(
    '/leads',
    requireScope('leads:read'),
    ah(async (req, res) => {
      res.json(
        await deps.leads.list(req.ctx!.tenantId, {
          status: req.query.status as string | undefined,
          stage: req.query.stage as string | undefined,
          owner: req.query.owner as string | undefined,
        }),
      );
    }),
  );

  return r;
}
