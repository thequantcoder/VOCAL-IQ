import { Injectable } from '@nestjs/common';
import {
  type CompletionResult,
  type LLMMessage,
  Router,
  type UsageMeter,
} from '@vocaliq/provider-router';
import { Capability } from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';
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
@Injectable()
export class RouterService {
  constructor(private readonly db: PrismaService) {}

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

    const router = new Router({ resolveKey: buildKeyResolver(this.db), meter });
    const llm = router.selectLLM({
      tenantId: args.tenantId,
      ...(args.agentId ? { agentId: args.agentId } : {}),
      capability: Capability.LLM,
      ...(args.model ? { model: args.model } : {}),
      ...(args.byok ? { byok: args.byok } : {}),
    });
    return llm.complete(args.messages, {
      ...(args.model ? { model: args.model } : {}),
      ...(args.system ? { system: args.system } : {}),
      ...(args.maxTokens ? { maxTokens: args.maxTokens } : {}),
    });
  }
}
