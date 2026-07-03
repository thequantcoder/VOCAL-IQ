import {
  type CompletionResult,
  type KeyResolver,
  type LLMMessage,
  Router,
  type UsageMeter,
} from '@vocaliq/provider-router';
import { Capability } from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';
import type { KeyPoolService } from '../keypool/keypool.service';
import { buildKeyResolver } from './key-resolver';

export interface CompleteArgs {
  tenantId: string;
  agentId?: string;
  messages: LLMMessage[];
  model?: string;
  system?: string;
  maxTokens?: number;
  byok?: boolean;
}

/**
 * Thin NestJS wrapper over the provider Router. Every completion meters cost by
 * persisting a tenant-scoped UsageRecord through the RLS client (golden rule #4) —
 * there is no un-metered LLM path.
 */
export class RouterService {
  constructor(
    private readonly db: PrismaService,
    private readonly keyPool?: KeyPoolService,
  ) {}

  async complete(args: CompleteArgs): Promise<CompletionResult> {
    const meter: UsageMeter = async (rec) => {
      await this.db.withTenant(args.tenantId, (tx) =>
        tx.usageRecord.create({
          data: {
            tenantId: args.tenantId,
            provider: rec.provider,
            capability: Capability.LLM,
            units: rec.units,
            costUsd: rec.costUsd,
            byok: rec.byok,
          },
        }),
      );
    };

    // Wrap the resolver so we can report the outcome of a pooled key for health/ejection
    // (Day 38). We record the LAST pool key used — for the common single-provider path this
    // is exact; across the Router's internal provider fallback it's best-effort attribution.
    const base = buildKeyResolver(this.db, this.keyPool);
    let lastPoolKeyId: string | undefined;
    const resolveKey: KeyResolver = async (t, p, b) => {
      const resolved = await base(t, p, b);
      if (resolved.poolKeyId) lastPoolKeyId = resolved.poolKeyId;
      return resolved;
    };

    const router = new Router({ resolveKey, meter });
    const llm = router.selectLLM({
      tenantId: args.tenantId,
      ...(args.agentId ? { agentId: args.agentId } : {}),
      capability: Capability.LLM,
      ...(args.model ? { model: args.model } : {}),
      ...(args.byok ? { byok: args.byok } : {}),
    });
    try {
      const result = await llm.complete(args.messages, {
        ...(args.model ? { model: args.model } : {}),
        ...(args.system ? { system: args.system } : {}),
        ...(args.maxTokens ? { maxTokens: args.maxTokens } : {}),
      });
      if (lastPoolKeyId) await this.keyPool?.recordResult(lastPoolKeyId, true);
      return result;
    } catch (err) {
      if (lastPoolKeyId) await this.keyPool?.recordResult(lastPoolKeyId, false);
      throw err;
    }
  }
}
