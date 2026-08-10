import {
  type CustomModelProfile,
  type CustomModelProvider,
  type FineTuneExample,
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
  startFineTune(input: {
    tenantId: string;
    name: string;
    baseModel: string;
    /** The consented chat-format training rows. The live adapter enforces the provider's minimum. */
    trainingExamples: FineTuneExample[];
  }): Promise<{ fineTuneId: string }>;
}

export class DisabledFineTuneProvider implements FineTuneProvider {
  readonly enabled = false;
  async startFineTune(): Promise<{ fineTuneId: string }> {
    throw new ValidationError(
      'Provider fine-tuning is not configured. Create a system-prompt customised model instead, or set a fine-tune provider key.',
    );
  }
}

/** OpenAI requires at least this many supervised examples to accept a fine-tuning job. */
export const MIN_FINE_TUNE_EXAMPLES = 10;

/**
 * Live OpenAI fine-tune provider. `startFineTune` uploads the consented training rows as a JSONL file
 * (`POST /v1/files`, `purpose=fine-tune`) and creates a job on the chosen base model
 * (`POST /v1/fine_tuning/jobs`), returning the job id (`ftjob-…`) as the `fineTuneId` the service stores
 * and later marks ready. Bearer key (never logged); `fetch` injectable for offline tests. Enforces the
 * provider's example minimum up front with a clear error.
 */
export class OpenAiFineTuneProvider implements FineTuneProvider {
  readonly enabled = true;
  private readonly base = 'https://api.openai.com/v1';

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async startFineTune(input: {
    tenantId: string;
    name: string;
    baseModel: string;
    trainingExamples: FineTuneExample[];
  }): Promise<{ fineTuneId: string }> {
    if (input.trainingExamples.length < MIN_FINE_TUNE_EXAMPLES) {
      throw new ValidationError(
        `A provider fine-tune needs at least ${MIN_FINE_TUNE_EXAMPLES} training examples.`,
      );
    }
    // 1. Upload the training set as a JSONL file (one chat-format row per line).
    const jsonl = input.trainingExamples.map((e) => JSON.stringify(e)).join('\n');
    const form = new FormData();
    form.append('purpose', 'fine-tune');
    form.append('file', new Blob([jsonl], { type: 'application/jsonl' }), `${input.name}.jsonl`);
    const fileRes = await this.fetchImpl(`${this.base}/files`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` }, // no content-type: fetch sets the boundary
      body: form,
    });
    if (!fileRes.ok) throw new ValidationError(`Fine-tune upload failed (${fileRes.status}).`);
    const file = (await fileRes.json().catch(() => ({}))) as { id?: string };
    if (!file.id) throw new ValidationError('Fine-tune upload did not return a file id.');

    // 2. Create the fine-tuning job on the base model.
    const jobRes = await this.fetchImpl(`${this.base}/fine_tuning/jobs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ training_file: file.id, model: input.baseModel }),
    });
    if (!jobRes.ok) throw new ValidationError(`Fine-tune job create failed (${jobRes.status}).`);
    const job = (await jobRes.json().catch(() => ({}))) as { id?: string };
    if (!job.id) throw new ValidationError('Fine-tune job did not return a job id.');
    return { fineTuneId: job.id };
  }
}

/**
 * Build the fine-tune provider from env (gated). The live OpenAI provider swaps in when `OPENAI_API_KEY`
 * is set (fine-tuning uses the same key); disabled otherwise, so a system-prompt custom model still works.
 */
export function buildFineTuneProvider(env: NodeJS.ProcessEnv = process.env): FineTuneProvider {
  if (env.OPENAI_API_KEY) return new OpenAiFineTuneProvider(env.OPENAI_API_KEY);
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
        trainingExamples: d.trainingExamples ?? [],
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
