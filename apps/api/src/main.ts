import { resolve } from 'node:path';
import { parseEnv } from '@vocaliq/shared';
import { config as loadDotenv } from 'dotenv';
import express from 'express';

// Secrets live in the monorepo root .env (one source of truth). Load before any env read.
loadDotenv({ path: resolve(process.cwd(), '../../.env') });

import { agentsRoutes } from './agents/agents.routes';
import { analyticsRoutes } from './analytics/analytics.routes';
import { apiKeyRoutes } from './api-keys/api-key.routes';
import { appointmentsRoutes } from './appointments/appointments.routes';
import { authRoutes } from './auth/auth.routes';
import { automationsRoutes } from './automations/automations.routes';
import { billingRoutes, billingWebhookHandler } from './billing/billing.routes';
import { planBuilderRoutes } from './billing/plan-builder.routes';
import { callsRoutes } from './calls/calls.routes';
import { campaignsRoutes } from './campaigns/campaigns.routes';
import { chatRoutes } from './chat/chat.routes';
import { complianceRoutes } from './compliance/compliance.routes';
import { createServices } from './composition';
import { costRoutes } from './cost/cost.routes';
import { experimentsRoutes } from './experiments/experiments.routes';
import { flowsRoutes } from './flows/flows.routes';
import { formsRoutes, publicFormsRoutes } from './forms/forms.routes';
import { governanceRoutes } from './governance/governance.routes';
import { healthRoutes } from './health.routes';
import { errorMiddleware, notFoundMiddleware } from './http/error.middleware';
import { integrationsRoutes } from './integrations/integrations.routes';
import { keyPoolRoutes } from './keypool/keypool.routes';
import { latencyRoutes } from './latency/latency.routes';
import { leadsRoutes } from './leads/leads.routes';
import { mcpRoutes } from './mcp/mcp.routes';
import { memoryRoutes } from './memory/memory.routes';
import {
  messagingRoutes,
  twilioWebhookHandler,
  whatsappWebhookHandler,
} from './messaging/messaging.routes';
import { initSentry, shutdownObservability } from './observability';
import { opsRoutes } from './ops/ops.routes';
import { v1Routes } from './public/v1.routes';
import { qaRoutes } from './qa/qa.routes';
import { ragRoutes } from './rag/rag.routes';
import { resellerRoutes } from './reseller/reseller.routes';
import { residencyRoutes } from './residency/residency.routes';
import { scaleRoutes } from './scale/scale.routes';
import { searchRoutes } from './search/search.routes';
import { sipRoutes } from './sip/sip.routes';
import { squadsRoutes } from './squads/squads.routes';
import { scimRoutes, ssoAdminRoutes, ssoPublicRoutes } from './sso/sso.routes';
import { superAdminRoutes } from './superadmin/superadmin.routes';
import { templatesRoutes } from './templates/templates.routes';
import { tenantRoutes } from './tenancy/tenant.routes';
import { testsRoutes } from './tests/tests.routes';
import { vaultRoutes } from './vault/vault.routes';
import { voicesRoutes } from './voices/voices.routes';
import { walletRoutes } from './wallet/wallet.routes';
import { webhookRoutes } from './webhooks/webhook.routes';
import { whitelabelResolveHandler, whitelabelRoutes } from './whitelabel/whitelabel.routes';
import { widgetRoutes } from './widget/widget.routes';

/** Validate env at boot (fail-fast), wire the Express app, and start the API. */
function bootstrap(): void {
  initSentry(); // no-ops without SENTRY_DSN
  const env = parseEnv();
  const s = createServices();

  const app = express();
  app.disable('x-powered-by');

  // Stripe webhook needs the RAW body for signature verification — register it BEFORE the
  // JSON body parser so `req.body` stays a Buffer.
  app.post(
    '/billing/webhook',
    express.raw({ type: '*/*' }),
    billingWebhookHandler(s.billingWebhook),
  );

  // Messaging webhooks (Day 44): WhatsApp needs the RAW body (HMAC-SHA256 over it); Twilio
  // needs URL-encoded params (signature is over URL + sorted params). Register before the
  // JSON parser. Per-tenant path so inbound routes to the right tenant.
  app.get('/public/messaging/whatsapp/:tenantId', whatsappWebhookHandler(s.messaging));
  app.post(
    '/public/messaging/whatsapp/:tenantId',
    express.raw({ type: '*/*' }),
    whatsappWebhookHandler(s.messaging),
  );
  app.post(
    '/public/messaging/twilio/:tenantId',
    express.urlencoded({ extended: false }),
    twilioWebhookHandler(s.messaging),
  );

  app.use(express.json({ limit: '5mb' }));

  // ── Routes (mounted at the same paths the Nest controllers used) ──────────────
  app.use('/', healthRoutes());
  app.use('/auth', authRoutes(s.auth));
  app.use('/tenants', tenantRoutes(s.db, s.tenants));
  app.use('/agents', agentsRoutes(s.agents, s.routerSvc, s.db, s.tenants));
  app.use('/agents/:agentId/flow', flowsRoutes(s.flows, s.tenants));
  app.use('/agents/:agentId/tests', testsRoutes(s.tests, s.tenants));
  app.use('/agents/:agentId/chat', chatRoutes(s.chat, s.tenants));
  app.use('/appointments', appointmentsRoutes(s.appointments, s.tenants));
  app.use('/templates', templatesRoutes(s.templates, s.tenants));
  app.use('/calls', callsRoutes(s.outbound, s.callsRead, s.tenants));
  app.use('/campaigns', campaignsRoutes(s.campaigns, s.tenants));
  app.use('/forms', formsRoutes(s.forms, s.tenants));
  app.use('/public/forms', publicFormsRoutes(s.forms));
  app.use('/admin/key-pool', keyPoolRoutes(s.keyPool, s.tenants));
  app.use('/integrations', integrationsRoutes(s.integrations, s.tenants));
  app.use('/analytics', analyticsRoutes(s.analytics, s.tenants));
  app.use('/qa', qaRoutes(s.qa, s.tenants));
  app.use('/mcp', mcpRoutes(s.mcp, s.tenants));
  app.use('/automations', automationsRoutes(s.automations, s.tenants));
  app.use('/api-keys', apiKeyRoutes(s.apiKeys, s.tenants));
  app.use('/webhooks', webhookRoutes(s.webhooks, s.tenants));
  app.use('/ops', opsRoutes(s.opsToolkit, s.tenants));
  app.use('/reseller', resellerRoutes(s.reseller, s.tenants));
  app.use('/admin/superadmin', superAdminRoutes(s.superAdmin, s.tenants));
  app.use('/admin/sso', ssoAdminRoutes(s.sso, s.tenants));
  app.use('/auth/sso', ssoPublicRoutes(s.sso));
  app.use('/scim/v2', scimRoutes(s.sso));
  app.use('/admin/plans', planBuilderRoutes(s.planBuilder, s.tenants));
  app.use('/admin/vault', vaultRoutes(s.vault, s.routingDefaults, s.tenants));
  app.use('/compliance', complianceRoutes(s.compliance, s.tenants));
  app.use('/residency', residencyRoutes(s.residency, s.tenants));
  app.use('/scale', scaleRoutes(s.scale, s.tenants));
  app.use('/latency', latencyRoutes(s.latency, s.tenants));
  app.use('/admin/governance', governanceRoutes(s.featureFlags, s.quota, s.auditLog, s.tenants));
  app.use('/whitelabel', whitelabelRoutes(s.whitelabel, s.tenants));
  app.use('/wallet', walletRoutes(s.wallet, s.tenants));
  // Public edge resolution: hostname → theme, unauthenticated (re-brands the sign-in page).
  app.get('/public/whitelabel', whitelabelResolveHandler(s.whitelabel));
  // Public API v1 — API-key authenticated (not session), rate-limited + metered.
  app.use(
    '/v1',
    v1Routes({
      keys: s.apiKeys,
      agents: s.agents,
      callsRead: s.callsRead,
      outbound: s.outbound,
      leads: s.leads,
    }),
  );
  app.use('/messaging', messagingRoutes(s.messaging, s.tenants));
  app.use('/leads', leadsRoutes(s.leads, s.tenants));
  app.use('/memory', memoryRoutes(s.memory, s.tenants));
  app.use('/sip', sipRoutes(s.sip, s.tenants));
  app.use('/experiments', experimentsRoutes(s.experiments, s.tenants));
  app.use('/squads', squadsRoutes(s.squads, s.tenants));
  app.use('/voices', voicesRoutes(s.voices, s.tenants));
  app.use('/kb', ragRoutes(s.rag, s.db, s.tenants));
  app.use('/search', searchRoutes(s.search, s.tenants));
  app.use('/billing', billingRoutes(s.plans, s.entitlements, s.processor, s.tenants));
  app.use('/widget', widgetRoutes(s.widget));
  // Cost controller used @Controller() (no prefix) → its paths (/calls/:id/cost, /costs/*)
  // are absolute, so mount at root last (a fallthrough for those exact paths).
  app.use('/', costRoutes(s.cost, s.tenants));

  // The single error boundary (safe ErrorResponse envelope) must be registered LAST.
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  const port = env.API_PORT;
  const server = app.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      server.close();
      void s.prisma
        .disconnect()
        .finally(() => shutdownObservability().finally(() => process.exit(0)));
    });
  }
}

bootstrap();
