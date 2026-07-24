import { MessengerCallingTelephony, WhatsAppCallingTelephony } from '@vocaliq/provider-router';
import {
  SLACK_EVENTS,
  type SlackEvent,
  buildTranslationPrompt,
  isNotificationEnabled,
} from '@vocaliq/shared';
import { AbuseService } from './abuse/abuse.service';
import { AgentsService } from './agents/agents.service';
import { AnalyticsApiService } from './analytics-api/analytics-api.service';
import { AnalyticsExportService } from './analytics-api/analytics-export.service';
import { AnalyticsService } from './analytics/analytics.service';
import { ApiKeyService } from './api-keys/api-key.service';
import { AppointmentsService } from './appointments/appointments.service';
import { AuthService } from './auth/auth.service';
import { AutomationsService } from './automations/automations.service';
import { buildActionExecutors } from './automations/executors';
import {
  AvatarService,
  mockAvatarProvider,
  unavailableAvatarProvider,
} from './avatars/avatar.service';
import { BenchmarkingService } from './benchmarking/benchmarking.service';
import { EntitlementsService } from './billing/entitlements.service';
import { OutcomeBillingService } from './billing/outcome-billing.service';
import { PlanBuilderService } from './billing/plan-builder.service';
import { PlansService } from './billing/plans.service';
import { type BillingProcessor, PendingBillingProcessor } from './billing/processor';
import { StripeBillingProcessor } from './billing/stripe-processor';
import { BillingWebhookService } from './billing/webhook.service';
import {
  BiometricsService,
  deterministicVoiceprintProvider,
} from './biometrics/biometrics.service';
import { CallbacksService } from './callbacks/callbacks.service';
import { CallsReadService } from './calls/calls-read.service';
import { PendingDialer } from './calls/dialer';
import { InstantDialService } from './calls/instant-dial.service';
import { OutboundService } from './calls/outbound.service';
import { CampaignsService } from './campaigns/campaigns.service';
import { ChatService } from './chat/chat.service';
import { CoachService } from './coach/coach.service';
import { ComplianceService } from './compliance/compliance.service';
import { CopilotService } from './copilot/copilot.service';
import { CostService } from './cost/cost.service';
import { buildEncryptor } from './crypto/envelope';
import { PrismaService } from './db/prisma.service';
import { DeskService } from './desk/desk.service';
import { DeveloperAppsService } from './developer-apps/developer-apps.service';
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
import { IntelService } from './intel/intel.service';
import { KeyPoolService } from './keypool/keypool.service';
import { LatencyService } from './latency/latency.service';
import { LaunchService } from './launch/launch.service';
import { LeadsService } from './leads/leads.service';
import { LearningService } from './learning/learning.service';
import { MarketplaceService } from './marketplace/marketplace.service';
import { McpService } from './mcp/mcp.service';
import { httpMcpTransport } from './mcp/transport';
import { MemoryService } from './memory/memory.service';
import { MessagingService } from './messaging/messaging.service';
import { buildSenders } from './messaging/senders';
import { MessengerCallCostService } from './messenger-calling/messenger-call-cost.service';
import { MessengerCallReadService } from './messenger-calling/messenger-call-read.service';
import { MessengerInboundRouter } from './messenger-calling/messenger-call-routing.service';
import { MessengerCallSettingsService } from './messenger-calling/messenger-call-settings.service';
import {
  type MeAdapterResolver,
  MessengerCallingService,
} from './messenger-calling/messenger-calling.service';
import {
  HttpMeMediaControl,
  type MeMediaControl,
  PendingMeMediaControl,
} from './messenger-calling/messenger-media-control';
import { MessengerPermissionService } from './messenger-calling/messenger-permission.service';
import { CustomModelsService, buildFineTuneProvider } from './models/custom-models.service';
import { NotificationPrefsService } from './notifications/notification-prefs.service';
import { NumbersService } from './numbers/numbers.service';
import { OpsService } from './ops/ops.service';
import {
  PaymentsService,
  buildPciCaptureProvider,
  buildReceiptSender,
} from './payments/payments.service';
import { QaService } from './qa/qa.service';
import { RagService, openAiEmbedder, prismaUsageSink } from './rag/rag.service';
import { ReputationService } from './reputation/reputation.service';
import { ResellerService } from './reseller/reseller.service';
import { ResidencyService } from './residency/residency.service';
import { RevenueService } from './revenue/revenue.service';
import { RouterService } from './router/router.service';
import { S2SService } from './s2s/s2s.service';
import { ScaleService } from './scale/scale.service';
import { SearchService } from './search/search.service';
import { SentimentService } from './sentiment/sentiment.service';
import { SipService } from './sip/sip.service';
import { SlackService } from './slack/slack.service';
import { SquadsService } from './squads/squads.service';
import { buildSsoProvider } from './sso/sso-provider';
import { SsoService } from './sso/sso.service';
import { SuperAdminService } from './superadmin/superadmin.service';
import { TemplatesService } from './templates/templates.service';
import { TenantService } from './tenancy/tenant.service';
import { TestsService, routerGrader } from './tests/tests.service';
import { TranscriptionService } from './transcription/transcription.service';
import { TranslationService } from './translation/translation.service';
import { RoutingDefaultsService } from './vault/routing-defaults.service';
import { VaultService } from './vault/vault.service';
import { UpdateService, resolveAppVersion } from './version/update.service';
import { VoicesService, elevenLabsCloner } from './voices/voices.service';
import { WalletService } from './wallet/wallet.service';
import type { WebhookEmitter } from './webhooks/webhook-emitter';
import { WebhookService } from './webhooks/webhook.service';
import { WhatsAppCallCostService } from './whatsapp-calling/whatsapp-call-cost.service';
import { WhatsAppCallReadService } from './whatsapp-calling/whatsapp-call-read.service';
import { WhatsAppInboundRouter } from './whatsapp-calling/whatsapp-call-routing.service';
import { WhatsAppCallSettingsService } from './whatsapp-calling/whatsapp-call-settings.service';
import {
  type WaAdapterResolver,
  WhatsAppCallingService,
} from './whatsapp-calling/whatsapp-calling.service';
import {
  HttpWaMediaControl,
  PendingWaMediaControl,
  type WaMediaControl,
} from './whatsapp-calling/whatsapp-media-control';
import { WhatsAppPermissionService } from './whatsapp-calling/whatsapp-permission.service';
import { WhatsAppRoutingService } from './whatsapp-calling/whatsapp-routing.service';
import { WhatsAppSipService } from './whatsapp-calling/whatsapp-sip.service';
import { buildCloudflareClient } from './whitelabel/cloudflare';
import { WhiteLabelService } from './whitelabel/whitelabel.service';
import { WidgetService } from './widget/widget.service';
import { PendingWorkflowQueue } from './workflows/workflow-queue';
import { WorkflowsService } from './workflows/workflows.service';

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
  // Domain-event emitter (built early so call/lead services can fire triggers). Fans out to
  // registered webhooks AND Slack notifications — both best-effort (never breaks the operation).
  const webhooks = new WebhookService(db);
  const slack = new SlackService(db);
  const notificationPrefs = new NotificationPrefsService(db);
  const emitDomainEvent: WebhookEmitter = async (tid, event, payload) => {
    // The per-tenant notification matrix gates each channel (default ON; fail-open if the read fails).
    const prefs = await notificationPrefs.getPrefs(tid).catch(() => ({}));
    const tasks: Promise<unknown>[] = [];
    if (isNotificationEnabled(prefs, event, 'webhook')) {
      tasks.push(webhooks.deliver(tid, event, payload));
    }
    if (
      (SLACK_EVENTS as readonly string[]).includes(event) &&
      isNotificationEnabled(prefs, event, 'slack')
    ) {
      tasks.push(slack.notify(tid, event as SlackEvent, payload));
    }
    await Promise.allSettled(tasks);
  };
  const outbound = new OutboundService(
    db,
    new PendingDialer(),
    (tid) => abuse.assess(tid),
    emitDomainEvent,
  );
  const instantDial = new InstantDialService(db, outbound, emitDomainEvent);

  const cost = new CostService(db);
  const analytics = new AnalyticsService(db);
  const chat = new ChatService(db);
  const apiKeys = new ApiKeyService(db);
  const opsToolkit = new OpsService(db, entitlements);
  const numbers = new NumbersService(db, entitlements);
  const reseller = new ResellerService(db);
  const wallet = new WalletService(db);
  const superAdmin = new SuperAdminService(db, wallet);
  // Self-host "Check for Updates" (PARITY-11): APP_VERSION is baked at build (from the VERSION file);
  // UPDATE_MANIFEST_URL points at the published releases.json. Read-only — never auto-applies.
  const update = new UpdateService(
    resolveAppVersion(process.env, '1.1.0'),
    process.env.UPDATE_MANIFEST_URL,
  );
  // Custom-domain SSL via Cloudflare for SaaS is gated on env; branding works without it.
  const whitelabel = new WhiteLabelService(db, buildCloudflareClient(process.env));
  const embedder = openAiEmbedder(process.env.OPENAI_API_KEY ?? '');
  const rag = new RagService(db, embedder, prismaUsageSink(db));
  const search = new SearchService(db, embedder, prismaUsageSink(db));

  const campaigns = new CampaignsService(db);
  const callbacks = new CallbacksService(db);
  const revenue = new RevenueService(db);
  const outcomeBilling = new OutcomeBillingService(db, wallet);
  const marketplace = new MarketplaceService(db, wallet, agents, flows);
  const developerApps = new DeveloperAppsService(db, apiKeys, wallet);
  // Workflow runs are executed by the apps/workers BullMQ engine; the live enqueue wires at deploy.
  const workflows = new WorkflowsService(db, new PendingWorkflowQueue());
  const benchmarking = new BenchmarkingService(db);
  const analyticsApi = new AnalyticsApiService(db);
  const analyticsExport = new AnalyticsExportService(db, analyticsApi);
  // Form-to-Call: a form submission with a phone + triggerAgentId dials the submitter on the vetted
  // outbound path. The submission is the lawful basis (SOFT_OPT_IN). Best-effort inside FormsService.
  const forms = new FormsService(db, undefined, undefined, undefined, (tid, input) =>
    outbound
      .placeCall(tid, {
        agentId: input.agentId,
        to: input.to,
        contactId: input.contactId,
        consentBasis: 'SOFT_OPT_IN',
      })
      .then((r) => ({ callId: r.callId })),
  );
  const integrations = new IntegrationsService(db);
  const leads = new LeadsService(db);
  const memory = new MemoryService(db);
  const mcp = new McpService(db, httpMcpTransport);
  // Messaging senders are built only for channels whose credentials are set (gated).
  const messaging = new MessagingService(db, buildSenders(process.env));
  // WhatsApp Business Calling control plane (WAC-02). Managed-mode adapter from env (per-tenant BYOK
  // resolution lands with the key vault later); null → gated (webhook records events, no signaling).
  const waCallingAdapterFor: WaAdapterResolver = async () => {
    const token = process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.WHATSAPP_TEST_ACCESS_TOKEN;
    const pnid = process.env.WHATSAPP_PHONE_NUMBER_ID ?? process.env.WHATSAPP_TEST_PHONE_NUMBER_ID;
    return token && pnid ? new WhatsAppCallingTelephony(token, pnid) : null;
  };
  // WAC-03 media control → the voice-service WebRTC bridge (SDP answer). Wired only when both the voice
  // URL + the shared internal secret are set; otherwise gated (PendingWaMediaControl → call stays connecting).
  const waMedia: WaMediaControl =
    process.env.VOICE_SERVICE_URL && process.env.VOICE_INTERNAL_SECRET
      ? new HttpWaMediaControl({
          voiceServiceUrl: process.env.VOICE_SERVICE_URL,
          internalSecret: process.env.VOICE_INTERNAL_SECRET,
        })
      : new PendingWaMediaControl();
  const whatsappCallSettings = new WhatsAppCallSettingsService(db, waCallingAdapterFor);
  const whatsappInboundRouter = new WhatsAppInboundRouter(db); // WAC-04: number → answering agent
  const whatsappPermission = new WhatsAppPermissionService(db, waCallingAdapterFor); // WAC-08 governor
  const whatsappRouting = new WhatsAppRoutingService(db, whatsappPermission); // WAC-09 route + guardrails
  const whatsappCallCost = new WhatsAppCallCostService(db); // WAC-06: meter carrier cost on terminate
  const whatsappSip = new WhatsAppSipService(
    db,
    whatsappCallSettings,
    waCallingAdapterFor,
    whatsappCallCost,
  ); // WAC-10: SIP mode for PBX tenants
  const whatsappCalling = new WhatsAppCallingService(
    db,
    waCallingAdapterFor,
    waMedia,
    whatsappCallCost,
    whatsappInboundRouter, // WAC-04: resolve the agent that answers
    (tenantId) => whatsappCallSettings.get(tenantId), // WAC-04: calling-hours gate
    whatsappPermission, // WAC-08: consented-outbound governor
    (tenantId, payload) => whatsappRouting.applyRestriction(tenantId, payload), // WAC-09: restrictions
  );
  const whatsappCallRead = new WhatsAppCallReadService(db); // WAC-07 dashboard read model
  // Messenger (Meta) Calling control plane (MEC-02). Managed-mode adapter from the Day-93 Messenger Page
  // token (same Page/app does messaging + calling); null → gated (webhook records events, no signaling).
  const meCallingAdapterFor: MeAdapterResolver = async () => {
    const token = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
    return token ? new MessengerCallingTelephony(token) : null;
  };
  // MEC-03 media control → the voice-service WebRTC bridge. Wired only when the voice URL + internal secret
  // are set; otherwise gated (PendingMeMediaControl → call stays connecting).
  const meMedia: MeMediaControl =
    process.env.VOICE_SERVICE_URL && process.env.VOICE_INTERNAL_SECRET
      ? new HttpMeMediaControl({
          voiceServiceUrl: process.env.VOICE_SERVICE_URL,
          internalSecret: process.env.VOICE_INTERNAL_SECRET,
        })
      : new PendingMeMediaControl();
  const messengerInboundRouter = new MessengerInboundRouter(db); // MEC-04: Page → answering agent
  const messengerCallCost = new MessengerCallCostService(db); // MEC-06: meter carrier cost on terminate
  const messengerCallSettings = new MessengerCallSettingsService(db, meCallingAdapterFor); // MEC-05
  const messengerPermission = new MessengerPermissionService(db, meCallingAdapterFor); // MEC-08 governor
  const messengerCalling = new MessengerCallingService(
    db,
    meCallingAdapterFor,
    meMedia,
    messengerCallCost, // MEC-06: cost attribution on terminate (golden rule #4)
    messengerInboundRouter, // MEC-04: resolve the agent that answers / dials
    (tenantId) => messengerCallSettings.get(tenantId), // MEC-05: availability-hours gate
    messengerPermission, // MEC-08: consented-outbound governor
  );
  const messengerCallRead = new MessengerCallReadService(db); // MEC-04 dashboard read model
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
  const intel = new IntelService(db);
  // Custom fine-tuned models: provider fine-tuning is gated; system-prompt customization always works.
  const customModels = new CustomModelsService(db, buildFineTuneProvider(process.env));
  // Pay-by-voice: PCI capture + receipt sending are gated seams (out-of-scope PCI model).
  const payments = new PaymentsService(
    db,
    buildPciCaptureProvider(process.env),
    buildReceiptSender(process.env),
  );
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

  // Live Co-Pilot for human sales teams (Day 90): the standalone wedge product. Live assist + the
  // post-call CRM draft route through the metered RouterService (rule #4); every suggestion is
  // agent-only whisper (self-audit C — never spoken to the caller).
  const copilot = new CopilotService(db, async ({ tenantId, system, user }) => {
    const result = await routerSvc.complete({
      tenantId,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return { text: result.text, model: result.model };
  });

  // Voice biometrics (Day 91): OFF + region-deny by default per tenant. The voiceprint embedding is
  // envelope-encrypted at rest (self-audit C) and never returned raw. The provider that turns audio
  // into an embedding + liveness is injected — the local deterministic provider serves self-host/tests;
  // a real vendor swaps into this seam when VOICE_BIOMETRICS_API_KEY is set (gated external dep).
  const biometrics = new BiometricsService(db, encryptor, deterministicVoiceprintProvider());

  // Video-avatar agents (Day 92): plan-gated + metered per second, with graceful voice fallback. The
  // avatar/video vendor is gated — `unavailable` by default (so video safely falls back to voice), and a
  // real provider (HeyGen/D-ID/Tavus-class) swaps into this seam when AVATAR_PROVIDER_API_KEY is set.
  const avatars = new AvatarService(
    db,
    (tid) => entitlements.hasFeature(tid, 'videoAvatar'),
    process.env.AVATAR_PROVIDER_API_KEY ? mockAvatarProvider() : unavailableAvatarProvider(),
  );

  // Real-time translation: every translation routes through the metered RouterService (rule #4 — no
  // un-metered LLM path). The prompt pins the model to a faithful translation (self-audit A).
  const translation = new TranslationService(
    db,
    async ({ tenantId, sourceLanguage, targetLanguage, text }) => {
      const { system, user } = buildTranslationPrompt(sourceLanguage, targetLanguage, text);
      const result = await routerSvc.complete({
        tenantId,
        system,
        messages: [{ role: 'user', content: user }],
      });
      return { translatedText: result.text, model: result.model };
    },
  );

  // Learn-from-top-reps (Day 89): distils an agent's best consent-eligible calls into persona
  // improvements. The single analysis routes through the metered RouterService (rule #4 — no un-metered
  // LLM path); the prompt treats transcripts strictly as data (self-audit A, injection defence).
  const learning = new LearningService(db, agents, async ({ tenantId, system, user }) => {
    const result = await routerSvc.complete({
      tenantId,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return { text: result.text, model: result.model };
  });

  const plans = new PlansService(db);
  const billingWebhook = new BillingWebhookService(db);
  // Live Stripe billing swaps in automatically once STRIPE_SECRET_KEY is set; until then the
  // gated PendingBillingProcessor keeps the app + billing logic fully usable (no live actions).
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const processor: BillingProcessor = stripeSecret
    ? new StripeBillingProcessor(
        {
          secretKey: stripeSecret,
          ...(process.env.STRIPE_USAGE_METER_EVENT
            ? { meterEventName: process.env.STRIPE_USAGE_METER_EVENT }
            : {}),
        },
        {
          resolveCheckoutContext: async (req) => {
            const plan = await db.admin.plan.findUnique({
              where: { id: req.planId },
              select: { stripePriceId: true },
            });
            return { stripePriceId: plan?.stripePriceId ?? null };
          },
        },
      )
    : new PendingBillingProcessor();
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
    instantDial,
    cost,
    analytics,
    chat,
    apiKeys,
    webhooks,
    slack,
    notificationPrefs,
    opsToolkit,
    numbers,
    reseller,
    whitelabel,
    wallet,
    superAdmin,
    update,
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
    whatsappCalling,
    whatsappCallSettings,
    whatsappCallRead,
    whatsappPermission,
    messengerCalling,
    messengerCallRead,
    messengerCallSettings,
    messengerPermission,
    whatsappRouting,
    whatsappSip,
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
    intel,
    customModels,
    payments,
    callbacks,
    revenue,
    outcomeBilling,
    marketplace,
    developerApps,
    workflows,
    benchmarking,
    analyticsApi,
    analyticsExport,
    translation,
    learning,
    copilot,
    biometrics,
    avatars,
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
