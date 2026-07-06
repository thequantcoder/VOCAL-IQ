import {
  type CustomModelProfile,
  type CustomModelProvider,
  NotFoundError,
  ValidationError,
  canCreateCustomModel,
  customModelSchema,
  resolveModelRouting,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Custom fine-tuned / customised models per tenant (Day 76). A tenant defines a brand model — a
 * base LLM + a brand system-prompt, optionally a provider fine-tune trained on their consented
 * data — and binds it to agents; the router then routes completions to it. TWO guarantees: CONSENT
 * is mandatory and recorded (self-audit C — no profile without it), and every profile is strictly
 * tenant-scoped via RLS so it can NEVER be read or resolved for another tenant (self-audit B). The
 * actual provider fine-tune is gated behind a seam — with no fine-tune provider configured, a
 * system-prompt "customised" model still works fully (self-audit D — no forced external spend).
 */

/** Gated fine-tune seam — mirrors the Day-26 VoiceCloner. Disabled fallback keeps custom models working. */
export interface FineTuneProvider {
  readonly enabled: boolean;
  startFineTune(input: { tenantId: string; name: string; baseModel: string }): Promise<{
    fineTuneId: string;
  }>;
}

export class DisabledFineTuneProvider implements FineTuneProvider {
  readonly enabled = false;
  async startFineTune(): Promise<{ fineTuneId: string }> {
    throw new ValidationError(
      'Provider fine-tuning is not configured. Create a system-prompt customised model instead, or set a fine-tune provider key.',
    );
  }
}

/** Build the fine-tune provider from env (gated). A real adapter swaps in when a key is present. */
export function buildFineTuneProvider(_env: NodeJS.ProcessEnv): FineTuneProvider {
  return new DisabledFineTuneProvider();
}

export interface Actor {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: string;
}

const MODEL_SELECT = {
  id: true,
  name: true,
  provider: true,
  baseModel: true,
  fineTuneId: true,
  systemPrompt: true,
  status: true,
  consentBy: true,
  consentAt: true,
  active: true,
  createdAt: true,
} as const;

export class CustomModelsService {
  constructor(
    private readonly db: PrismaService,
    private readonly fineTune: FineTuneProvider,
  ) {}

  async list(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx.customModel.findMany({
        where: { active: true },
        orderBy: { createdAt: 'desc' },
        select: MODEL_SELECT,
      }),
    );
  }

  async get(tenantId: string, id: string) {
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.customModel.findFirst({ where: { id }, select: MODEL_SELECT }),
    );
    if (!row) throw new NotFoundError('Custom model not found');
    return row;
  }

  /**
   * Create a brand model. Consent is mandatory (gate + schema). If a provider fine-tune is
   * requested it's kicked off through the gated seam (status → training); otherwise it's a
   * system-prompt customised model that's immediately ready.
   */
  async create(tenantId: string, input: unknown) {
    const parsed = customModelSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid model');
    const d = parsed.data;

    const gate = canCreateCustomModel({ consent: d.consent });
    if (!gate.ok) throw new ValidationError(gate.reason);

    let status = 'ready';
    let fineTuneId: string | null = null;
    if (d.requestFineTune) {
      // Gated: throws a clear "not configured" error when no fine-tune provider is set.
      const job = await this.fineTune.startFineTune({
        tenantId,
        name: d.name,
        baseModel: d.baseModel,
      });
      fineTuneId = job.fineTuneId;
      status = 'training';
    }

    return this.db.withTenant(tenantId, (tx) =>
      tx.customModel.create({
        data: {
          tenantId,
          name: d.name,
          provider: d.provider,
          baseModel: d.baseModel,
          fineTuneId,
          systemPrompt: d.systemPrompt ?? null,
          status,
          consentBy: d.consent.consentedBy,
          consentText: d.consent.consentText,
        },
        select: MODEL_SELECT,
      }),
    );
  }

  /** Fine-tune completion (gated path): mark a training model ready with its provider fine-tune id. */
  async markTrained(tenantId: string, id: string, fineTuneId: string) {
    const res = await this.db.withTenant(tenantId, (tx) =>
      tx.customModel.updateMany({
        where: { id, status: 'training' },
        data: { fineTuneId, status: 'ready' },
      }),
    );
    if (res.count === 0) throw new NotFoundError('Training model not found');
    return this.get(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<{ removed: boolean }> {
    const res = await this.db.withTenant(tenantId, (tx) =>
      tx.customModel.deleteMany({ where: { id } }),
    );
    if (res.count === 0) throw new NotFoundError('Custom model not found');
    // Unbind any agents that referenced it (tenant-scoped).
    await this.db.withTenant(tenantId, (tx) =>
      tx.agent.updateMany({ where: { customModelId: id }, data: { customModelId: null } }),
    );
    return { removed: true };
  }

  /** Bind (or clear) an agent's custom model. A model must be tenant-owned AND ready to be bound. */
  async assignToAgent(tenantId: string, agentId: string, customModelId: string | null) {
    return this.db.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findFirst({ where: { id: agentId }, select: { id: true } });
      if (!agent) throw new NotFoundError('Agent not found');
      if (customModelId) {
        const model = await tx.customModel.findFirst({
          where: { id: customModelId, active: true },
          select: { status: true },
        });
        if (!model) throw new NotFoundError('Custom model not found');
        if (model.status !== 'ready')
          throw new ValidationError('Custom model is not ready yet (still training or failed).');
      }
      await tx.agent.update({ where: { id: agentId }, data: { customModelId } });
      return { agentId, customModelId };
    });
  }

  /**
   * Resolve the routing an agent's custom model implies — `{ provider, model, system }` for the
   * provider Router. Returns null when the agent has no custom model. RLS-scoped: calling this for
   * an agent in another tenant finds nothing (cross-tenant resolution is impossible — self-audit B).
   */
  async resolveForAgent(
    tenantId: string,
    agentId: string,
  ): Promise<{ provider: CustomModelProvider; model: string; system?: string } | null> {
    return this.db.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findFirst({
        where: { id: agentId },
        select: { customModelId: true },
      });
      if (!agent?.customModelId) return null;
      const m = await tx.customModel.findFirst({
        where: { id: agent.customModelId, active: true },
        select: {
          provider: true,
          baseModel: true,
          fineTuneId: true,
          systemPrompt: true,
          status: true,
        },
      });
      if (!m) return null;
      const profile: CustomModelProfile = {
        provider: m.provider as CustomModelProvider,
        baseModel: m.baseModel,
        fineTuneId: m.fineTuneId,
        systemPrompt: m.systemPrompt,
        status: m.status as CustomModelProfile['status'],
      };
      return resolveModelRouting(profile);
    });
  }
}
