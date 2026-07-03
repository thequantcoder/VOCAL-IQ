import {
  AgentStatus,
  type AgentStatus as AgentStatusT,
  AgentType,
  type AgentType as AgentTypeT,
  BANNED_WORDS_ACTIONS,
  NotFoundError,
  ValidationError,
} from '@vocaliq/shared';
import { z } from 'zod';
import { EntitlementsService } from '../billing/entitlements.service';
import { PrismaService } from '../db/prisma.service';

/** Explicit DTOs so the public API type never leaks Prisma's runtime types (TS2742). */
export interface AgentListItem {
  id: string;
  name: string;
  type: AgentTypeT;
  status: AgentStatusT;
  languages: string[];
  updatedAt: Date;
}

export interface AgentDetail {
  id: string;
  name: string;
  description: string | null;
  persona: unknown;
  type: AgentTypeT;
  status: AgentStatusT;
  languages: string[];
  turnTimeoutMs: number;
  maxCallDurationSec: number;
  maxSilenceSec: number;
  endOnVoicemail: boolean;
  bannedWordsAction: string;
  keyTerms: string[];
  noVerbatim: boolean;
  defaultVoiceId: string | null;
  memoryEnabled: boolean;
  updatedAt: Date;
  createdAt: Date;
}

/**
 * Agent CRUD backing the dashboard (Day 14). Every read/write is RLS-scoped via
 * `withTenant`, so a tenant only ever sees + edits its own agents (golden rule #1).
 * The prompt-based agent stores its system prompt inside `persona` JSON.
 */

export const createAgentSchema = z.object({
  name: z.string().min(1).max(120),
  systemPrompt: z.string().max(8_000).default(''),
  type: z.enum([AgentType.INBOUND, AgentType.OUTBOUND, AgentType.MIXED]).default(AgentType.INBOUND),
  status: z.enum([AgentStatus.DRAFT, AgentStatus.PUBLISHED]).default(AgentStatus.DRAFT),
  languages: z.array(z.string().min(2).max(10)).max(20).default([]),
  turnTimeoutMs: z.number().int().min(200).max(10_000).default(1500),
  // Cost/reliability guards (Day 38).
  maxCallDurationSec: z.number().int().min(30).max(7200).optional(),
  maxSilenceSec: z.number().int().min(0).max(120).optional(),
  endOnVoicemail: z.boolean().optional(),
  bannedWords: z.array(z.string().min(1).max(60)).max(100).optional(),
  bannedWordsAction: z.enum(BANNED_WORDS_ACTIONS).optional(),
  // Transcription controls (Day 39).
  keyTerms: z.array(z.string().min(1).max(60)).max(100).optional(),
  noVerbatim: z.boolean().optional(),
  defaultVoiceId: z.string().uuid().optional(),
  memoryEnabled: z.boolean().optional(),
});

export const updateAgentSchema = createAgentSchema.partial();

const AGENT_SELECT = {
  id: true,
  name: true,
  description: true,
  persona: true,
  type: true,
  status: true,
  languages: true,
  turnTimeoutMs: true,
  maxCallDurationSec: true,
  maxSilenceSec: true,
  endOnVoicemail: true,
  bannedWordsAction: true,
  keyTerms: true,
  noVerbatim: true,
  defaultVoiceId: true,
  memoryEnabled: true,
  updatedAt: true,
  createdAt: true,
} as const;

export class AgentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** List the tenant's agents, newest first (small tenants; pagination lands with scale). */
  async list(tenantId: string): Promise<AgentListItem[]> {
    return this.db.withTenant(tenantId, (tx) =>
      tx.agent.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          languages: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
    );
  }

  async get(tenantId: string, id: string): Promise<AgentDetail> {
    const agent = await this.db.withTenant(tenantId, (tx) =>
      tx.agent.findFirst({ where: { id }, select: AGENT_SELECT }),
    );
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  async create(tenantId: string, input: unknown): Promise<AgentDetail> {
    const parsed = createAgentSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid agent');
    }
    // Enforce the plan's agent limit before creating (Day 15 gating).
    await this.entitlements.assertCanCreateAgent(tenantId);
    const {
      name,
      systemPrompt,
      type,
      status,
      languages,
      turnTimeoutMs,
      maxCallDurationSec,
      maxSilenceSec,
      endOnVoicemail,
      bannedWords,
      bannedWordsAction,
      keyTerms,
      noVerbatim,
      defaultVoiceId,
      memoryEnabled,
    } = parsed.data;
    return this.db.withTenant(tenantId, (tx) =>
      tx.agent.create({
        data: {
          tenantId,
          name,
          persona: { systemPrompt, ...(bannedWords ? { bannedWords } : {}) },
          type,
          status,
          languages,
          turnTimeoutMs,
          ...(maxCallDurationSec !== undefined ? { maxCallDurationSec } : {}),
          ...(maxSilenceSec !== undefined ? { maxSilenceSec } : {}),
          ...(endOnVoicemail !== undefined ? { endOnVoicemail } : {}),
          ...(bannedWordsAction !== undefined ? { bannedWordsAction } : {}),
          ...(keyTerms !== undefined ? { keyTerms } : {}),
          ...(noVerbatim !== undefined ? { noVerbatim } : {}),
          ...(defaultVoiceId ? { defaultVoiceId } : {}),
          ...(memoryEnabled !== undefined ? { memoryEnabled } : {}),
        },
        select: AGENT_SELECT,
      }),
    );
  }

  async update(tenantId: string, id: string, input: unknown): Promise<AgentDetail> {
    const parsed = updateAgentSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid agent');
    }
    const data = parsed.data;
    return this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.agent.findFirst({ where: { id }, select: { persona: true } });
      if (!existing) throw new NotFoundError('Agent not found');

      // Merge persona so a banned-words edit never wipes the system prompt (and vice-versa).
      let persona: Record<string, unknown> | undefined;
      if (data.systemPrompt !== undefined || data.bannedWords !== undefined) {
        const current = (existing.persona ?? {}) as Record<string, unknown>;
        persona = {
          ...current,
          ...(data.systemPrompt !== undefined ? { systemPrompt: data.systemPrompt } : {}),
          ...(data.bannedWords !== undefined ? { bannedWords: data.bannedWords } : {}),
        };
      }

      return tx.agent.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(persona !== undefined ? { persona: persona as object } : {}),
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.languages !== undefined ? { languages: data.languages } : {}),
          ...(data.turnTimeoutMs !== undefined ? { turnTimeoutMs: data.turnTimeoutMs } : {}),
          ...(data.maxCallDurationSec !== undefined
            ? { maxCallDurationSec: data.maxCallDurationSec }
            : {}),
          ...(data.maxSilenceSec !== undefined ? { maxSilenceSec: data.maxSilenceSec } : {}),
          ...(data.endOnVoicemail !== undefined ? { endOnVoicemail: data.endOnVoicemail } : {}),
          ...(data.bannedWordsAction !== undefined
            ? { bannedWordsAction: data.bannedWordsAction }
            : {}),
          ...(data.keyTerms !== undefined ? { keyTerms: data.keyTerms } : {}),
          ...(data.noVerbatim !== undefined ? { noVerbatim: data.noVerbatim } : {}),
          ...(data.defaultVoiceId !== undefined ? { defaultVoiceId: data.defaultVoiceId } : {}),
          ...(data.memoryEnabled !== undefined ? { memoryEnabled: data.memoryEnabled } : {}),
        },
        select: AGENT_SELECT,
      });
    });
  }
}
