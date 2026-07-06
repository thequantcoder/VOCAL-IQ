import { AbuseService } from './abuse/abuse.service';
import { AgentsService } from './agents/agents.service';
import { AnalyticsService } from './analytics/analytics.service';
import { ApiKeyService } from './api-keys/api-key.service';
import { AppointmentsService } from './appointments/appointments.service';
import { AuthService } from './auth/auth.service';
import { AutomationsService } from './automations/automations.service';
import { buildActionExecutors } from './automations/executors';
import { EntitlementsService } from './billing/entitlements.service';
import { PlanBuilderService } from './billing/plan-builder.service';
import { PlansService } from './billing/plans.service';
import { PendingBillingProcessor } from './billing/processor';
import { BillingWebhookService } from './billing/webhook.service';
import { CallsReadService } from './calls/calls-read.service';
import { PendingDialer } from './calls/dialer';
import { OutboundService } from './calls/outbound.service';
import { CampaignsService } from './campaigns/campaigns.service';
import { ChatService } from './chat/chat.service';
import { CoachService } from './coach/coach.service';
import { ComplianceService } from './compliance/compliance.service';
import { CostService } from './cost/cost.service';
import { buildEncryptor } from './crypto/envelope';
import { PrismaService } from './db/prisma.service';
import { DeskService } from './desk/desk.service';
import { DisclosureService } from './disclosure/disclosure.service';
import { EmailService, buildEmailSender } from './email/email.service';
import { ExperimentsService } from './experiments/experiments.service';
import { FlowsService } from './flows/flows.service';
import { FormsService } from './forms/forms.service';
import { FraudService } from './fraud/fraud.service';
import { AuditService } from './governance/audit.service';
import { FeatureFlagsService } from './governance/feature-flags.service';
import { QuotaService } from './governance/quota.service';
import { IntegrationsService } from './integrations/integrations.service';
import { KeyPoolService } from './keypool/keypool.service';
import { LatencyService } from './latency/latency.service';
import { LaunchService } from './launch/launch.service';
import { LeadsService } from './leads/leads.service';
import { McpService } from './mcp/mcp.service';
import { httpMcpTransport } from './mcp/transport';
import { MemoryService } from './memory/memory.service';
import { MessagingService } from './messaging/messaging.service';
import { buildSenders } from './messaging/senders';
import { OpsService } from './ops/ops.service';
import { QaService } from './qa/qa.service';
import { RagService, openAiEmbedder, prismaUsageSink } from './rag/rag.service';
import { ReputationService } from './reputation/reputation.service';
import { ResellerService } from './reseller/reseller.service';
import { ResidencyService } from './residency/residency.service';
import { RouterService } from './router/router.service';
import { S2SService } from './s2s/s2s.service';
import { ScaleService } from './scale/scale.service';
import { SearchService } from './search/search.service';
import { SentimentService } from './sentiment/sentiment.service';
import { SipService } from './sip/sip.service';
import { SquadsService } from './squads/squads.service';
import { buildSsoProvider } from './sso/sso-provider';
import { SsoService } from './sso/sso.service';
import { SuperAdminService } from './superadmin/superadmin.service';
import { TemplatesService } from './templates/templates.service';
import { TenantService } from './tenancy/tenant.service';
import { TestsService, routerGrader } from './tests/tests.service';
import { TranscriptionService } from './transcription/transcription.service';
import { RoutingDefaultsService } from './vault/routing-defaults.service';
import { VaultService } from './vault/vault.service';
import { VoicesService, elevenLabsCloner } from './voices/voices.service';
import { WalletService } from './wallet/wallet.service';
import { WebhookService } from './webhooks/webhook.service';
import { buildCloudflareClient } from './whitelabel/cloudflare';
import { WhiteLabelService } from './whitelabel/whitelabel.service';
import { WidgetService } from './widget/widget.service';

/**
 * Composition root — the plain-Node replacement for Nest's DI container. Instantiate every
 * service once with its concrete dependencies (BYOK provider keys read from env) and hand
 * the graph to `main.ts`, which mounts the Express routers. One place to see the whole
 * wiring; no decorators, no magic.
 */
export function createServices() {
  const prisma = new PrismaService();
  const db = prisma;

  const tenants = new TenantService(db);
  const auth = new AuthService(db);

  const entitlements = new EntitlementsService(db);
  const agents = new AgentsService(db, entitlements);
  const appointments = new AppointmentsService(db);
  const flows = new FlowsService(db);
  const templates = new TemplatesService(agents, flows);

  const callsRead = new CallsReadService(db);
  const transcription = new TranscriptionService(db);
  const abuse = new AbuseService(db);
  const outbound = new OutboundService(db, new PendingDialer(), (tid) => abuse.assess(tid));

  const cost = new CostService(db);
  const analytics = new AnalyticsService(db);
  const chat = new ChatService(db);
  const apiKeys = new ApiKeyService(db);
  const webhooks = new WebhookService(db);
  const opsToolkit = new OpsService(db, entitlements);
  const reseller = new ResellerService(db);
  const wallet = new WalletService(db);
  const superAdmin = new SuperAdminService(db);
  // Custom-domain SSL via Cloudflare for SaaS is gated on env; branding works without it.
  const whitelabel = new WhiteLabelService(db, buildCloudflareClient(process.env));
  const embedder = openAiEmbedder(process.env.OPENAI_API_KEY ?? '');
  const rag = new RagService(db, embedder, prismaUsageSink(db));
  const search = new SearchService(db, embedder, prismaUsageSink(db));

  const campaigns = new CampaignsService(db);
  const forms = new FormsService(db);
  const integrations = new IntegrationsService(db);
  const leads = new LeadsService(db);
  const memory = new MemoryService(db);
  const mcp = new McpService(db, httpMcpTransport);
  // Messaging senders are built only for channels whose credentials are set (gated).
  const messaging = new MessagingService(db, buildSenders(process.env));
  // Cross-channel automations reuse the messaging + integration subsystems as action executors.
  const automations = new AutomationsService(
    db,
    buildActionExecutors({ db, messaging, integrations }),
  );
  const sip = new SipService(db, entitlements);
  const experiments = new ExperimentsService(db);
  const squads = new SquadsService(db);
  const voices = new VoicesService(db, elevenLabsCloner(process.env.ELEVENLABS_API_KEY ?? ''));
  const encryptor = buildEncryptor(process.env);
  const keyPool = new KeyPoolService(db, encryptor);
  const routerSvc = new RouterService(db, keyPool);
  const vault = new VaultService(db, encryptor);
  const routingDefaults = new RoutingDefaultsService(db);
  const featureFlags = new FeatureFlagsService(db, entitlements);
  const quota = new QuotaService(db, entitlements);
  const auditLog = new AuditService(db);
  const sso = new SsoService(db, buildSsoProvider(process.env));
  const compliance = new ComplianceService(db);
  const residency = new ResidencyService(db, process.env);
  const scale = new ScaleService(process.env);
  const latency = new LatencyService(db);
  // S2S provider is gated on env (OpenAI Realtime / Gemini Live) — false in dev/CI → pipeline.
  const s2s = new S2SService(db, Boolean(process.env.S2S_PROVIDER_KEY));
  const launch = new LaunchService(db, process.env);
  const desk = new DeskService(db);
  // Sentiment-triggered live actions reuse the Agent Desk for real-human escalation (Day 73).
  const sentiment = new SentimentService(db, desk);
  const disclosure = new DisclosureService(db);
  const email = new EmailService(db, buildEmailSender(process.env));
  // Live spam-label lookup is gated on a reputation API key; a null-returning stub in dev/CI.
  const reputation = new ReputationService(db);
  const fraud = new FraudService(db);
  const tests = new TestsService(db, (tenantId) => routerGrader(routerSvc, tenantId));
  // QA scoring completer: route through RouterService so every eval meters cost (rule #4).
  const qa = new QaService(db, async ({ tenantId, system, user }) => {
    const result = await routerSvc.complete({
      tenantId,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return { text: result.text, model: result.model };
  });

  // Agent-desk copilot: grounds on RAG + a metered RouterService completion (rule #4). Agent-only.
  const coach = new CoachService(db, rag, async ({ tenantId, system, user }) => {
    const result = await routerSvc.complete({
      tenantId,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return { text: result.text, model: result.model };
  });

  const plans = new PlansService(db);
  const billingWebhook = new BillingWebhookService(db);
  const processor = new PendingBillingProcessor();
  const planBuilder = new PlanBuilderService(db, processor);

  const widget = new WidgetService(db);

  return {
    prisma,
    db,
    tenants,
    auth,
    entitlements,
    agents,
    appointments,
    flows,
    templates,
    callsRead,
    transcription,
    outbound,
    cost,
    analytics,
    chat,
    apiKeys,
    webhooks,
    opsToolkit,
    reseller,
    whitelabel,
    wallet,
    superAdmin,
    rag,
    search,
    qa,
    campaigns,
    forms,
    integrations,
    leads,
    memory,
    mcp,
    messaging,
    automations,
    sip,
    experiments,
    squads,
    voices,
    keyPool,
    routerSvc,
    tests,
    plans,
    planBuilder,
    vault,
    routingDefaults,
    featureFlags,
    quota,
    auditLog,
    sso,
    compliance,
    residency,
    scale,
    latency,
    s2s,
    launch,
    desk,
    sentiment,
    coach,
    disclosure,
    email,
    reputation,
    fraud,
    abuse,
    billingWebhook,
    processor,
    widget,
  };
}

export type Services = ReturnType<typeof createServices>;
