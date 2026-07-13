import {
  WEBHOOK_EVENTS,
  analyticsQuerySchema,
  buildN8nTemplates,
  buildOpenApiSpec,
  hasScope,
} from '@vocaliq/shared';
import { Router } from 'express';
import type { AgentsService } from '../agents/agents.service';
import type { AnalyticsApiService } from '../analytics-api/analytics-api.service';
import { apiKeyAuth, requireScope } from '../api-keys/api-key.middleware';
import type { ApiKeyService } from '../api-keys/api-key.service';
import type { CallsReadService } from '../calls/calls-read.service';
import type { InstantDialService } from '../calls/instant-dial.service';
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
  instantDial: InstantDialService;
  leads: LeadsService;
  analyticsApi: AnalyticsApiService;
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

  // Instant dial: create/dedupe a lead from a bare phone number, then dial it in one call.
  r.post(
    '/calls/dial',
    requireScope('calls:write'),
    ah(async (req, res) => {
      res.status(201).json(await deps.instantDial.dial(req.ctx!.tenantId, req.body));
    }),
  );

  // n8n discovery: importable workflow templates + the webhook event catalog + this API's base URL.
  // Lets a user wire VocalIQ into n8n's 400+ apps with zero custom code.
  r.get(
    '/n8n/templates',
    requireScope('agents:read'),
    ah(async (_req, res) => {
      const baseUrl = process.env.PUBLIC_API_URL ?? 'https://your-vocaliq-domain';
      res.json({
        apiBaseUrl: baseUrl,
        webhookEvents: WEBHOOK_EVENTS,
        templates: buildN8nTemplates(baseUrl),
      });
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

  // ── analytics (Day 87 — enterprise BI). PII is masked unless the key ALSO holds pii:read. ──
  r.get(
    '/analytics/calls',
    requireScope('analytics:read'),
    ah(async (req, res) => {
      const query = analyticsQuerySchema.parse(req.query);
      const includePii = hasScope(req.apiScopes ?? [], 'pii:read');
      res.json(await deps.analyticsApi.listCalls(req.ctx!.tenantId, query, { includePii }));
    }),
  );
  r.get(
    '/analytics/usage',
    requireScope('analytics:read'),
    ah(async (req, res) => {
      const q = analyticsQuerySchema.parse(req.query);
      res.json(
        await deps.analyticsApi.usage(req.ctx!.tenantId, {
          ...(q.from ? { from: q.from } : {}),
          ...(q.to ? { to: q.to } : {}),
        }),
      );
    }),
  );

  return r;
}
