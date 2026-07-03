import { resolve } from 'node:path';
import { parseEnv } from '@vocaliq/shared';
import { config as loadDotenv } from 'dotenv';
import express from 'express';

// Secrets live in the monorepo root .env (one source of truth). Load before any env read.
loadDotenv({ path: resolve(process.cwd(), '../../.env') });

import { agentsRoutes } from './agents/agents.routes';
import { authRoutes } from './auth/auth.routes';
import { billingRoutes, billingWebhookHandler } from './billing/billing.routes';
import { callsRoutes } from './calls/calls.routes';
import { campaignsRoutes } from './campaigns/campaigns.routes';
import { createServices } from './composition';
import { costRoutes } from './cost/cost.routes';
import { experimentsRoutes } from './experiments/experiments.routes';
import { flowsRoutes } from './flows/flows.routes';
import { healthRoutes } from './health.routes';
import { errorMiddleware, notFoundMiddleware } from './http/error.middleware';
import { leadsRoutes } from './leads/leads.routes';
import { memoryRoutes } from './memory/memory.routes';
import { initSentry, shutdownObservability } from './observability';
import { ragRoutes } from './rag/rag.routes';
import { sipRoutes } from './sip/sip.routes';
import { squadsRoutes } from './squads/squads.routes';
import { templatesRoutes } from './templates/templates.routes';
import { tenantRoutes } from './tenancy/tenant.routes';
import { testsRoutes } from './tests/tests.routes';
import { voicesRoutes } from './voices/voices.routes';
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

  app.use(express.json({ limit: '5mb' }));

  // ── Routes (mounted at the same paths the Nest controllers used) ──────────────
  app.use('/', healthRoutes());
  app.use('/auth', authRoutes(s.auth));
  app.use('/tenants', tenantRoutes(s.db, s.tenants));
  app.use('/agents', agentsRoutes(s.agents, s.routerSvc, s.db, s.tenants));
  app.use('/agents/:agentId/flow', flowsRoutes(s.flows, s.tenants));
  app.use('/agents/:agentId/tests', testsRoutes(s.tests, s.tenants));
  app.use('/templates', templatesRoutes(s.templates, s.tenants));
  app.use('/calls', callsRoutes(s.outbound, s.callsRead, s.tenants));
  app.use('/campaigns', campaignsRoutes(s.campaigns, s.tenants));
  app.use('/leads', leadsRoutes(s.leads, s.tenants));
  app.use('/memory', memoryRoutes(s.memory, s.tenants));
  app.use('/sip', sipRoutes(s.sip, s.tenants));
  app.use('/experiments', experimentsRoutes(s.experiments, s.tenants));
  app.use('/squads', squadsRoutes(s.squads, s.tenants));
  app.use('/voices', voicesRoutes(s.voices, s.tenants));
  app.use('/kb', ragRoutes(s.rag, s.db, s.tenants));
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
