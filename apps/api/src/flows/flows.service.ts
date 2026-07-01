import { Injectable } from '@nestjs/common';
import type { Prisma } from '@vocaliq/db';
import {
  NotFoundError,
  ValidationError,
  compileFlow,
  emptyFlowGraph,
  flowGraphSchema,
} from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';

/**
 * Flow persistence for the builder (Day 17): the agent's draft FlowVersion.graph round-
 * trips to Postgres. `getOrCreateDraft` lazily creates the Flow + v1 (a single START
 * node) on first open; `saveGraph` validates the schema and autosaves into the current
 * unpublished version (publishing new versions is Day 22). All RLS-scoped.
 */

export interface FlowDraft {
  flowId: string;
  versionId: string;
  version: number;
  graph: unknown;
}

export interface SaveResult {
  versionId: string;
  version: number;
  savedAt: string;
}

export interface PublishResult {
  publishedVersion: number;
  nextDraftVersion: number;
  publishedAt: string;
}

export interface VersionSummary {
  version: number;
  publishedAt: Date | null;
  createdAt: Date;
  isDraft: boolean;
}

@Injectable()
export class FlowsService {
  constructor(private readonly db: PrismaService) {}

  /** List a flow's versions (newest first) for the version-history panel. */
  async listVersions(tenantId: string, agentId: string): Promise<VersionSummary[]> {
    return this.db.withTenant(tenantId, async (tx) => {
      const flow = await tx.flow.findFirst({
        where: { agentId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!flow) return [];
      const versions = await tx.flowVersion.findMany({
        where: { flowId: flow.id },
        orderBy: { version: 'desc' },
        select: { version: true, publishedAt: true, createdAt: true },
      });
      return versions.map((v) => ({ ...v, isDraft: v.publishedAt === null }));
    });
  }

  /**
   * Rollback: copy a prior version's graph into the current draft (draft-isolated — it
   * never mutates a published version). The builder can then re-publish it. RLS-scoped.
   */
  async restoreVersion(
    tenantId: string,
    agentId: string,
    version: number,
  ): Promise<{ restoredFrom: number; draftVersion: number }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const flow = await tx.flow.findFirst({
        where: { agentId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!flow) throw new NotFoundError('Flow not found');

      const source = await tx.flowVersion.findFirst({
        where: { flowId: flow.id, version },
        select: { graph: true },
      });
      if (!source) throw new NotFoundError(`Version ${version} not found`);

      const draft = await tx.flowVersion.findFirst({
        where: { flowId: flow.id, publishedAt: null },
        orderBy: { version: 'desc' },
        select: { id: true, version: true },
      });
      if (!draft) throw new NotFoundError('No editable draft to restore into');

      await tx.flowVersion.update({
        where: { id: draft.id },
        data: { graph: source.graph as unknown as Prisma.InputJsonValue },
      });
      return { restoredFrom: version, draftVersion: draft.version };
    });
  }

  /**
   * Publish the draft: compile it (Day 22) as a gate — reject if not runnable — then pin
   * the version (publishedAt) + activate the flow + open a fresh draft for future edits so
   * live calls keep running the pinned version (safe hot-swap).
   */
  async publishFlow(tenantId: string, agentId: string): Promise<PublishResult> {
    return this.db.withTenant(tenantId, async (tx) => {
      const flow = await tx.flow.findFirst({
        where: { agentId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!flow) throw new NotFoundError('Flow not found — open the builder first');

      const version = await tx.flowVersion.findFirst({
        where: { flowId: flow.id, publishedAt: null },
        orderBy: { version: 'desc' },
        select: { id: true, version: true, graph: true },
      });
      if (!version) throw new NotFoundError('No draft version to publish');

      const parsed = flowGraphSchema.safeParse(version.graph);
      if (!parsed.success) throw new ValidationError('Draft graph is malformed');
      const compiled = compileFlow(parsed.data);
      if (!compiled.ok) {
        const summary = compiled.errors
          .slice(0, 3)
          .map((e) => e.message)
          .join('; ');
        throw new ValidationError(
          `Flow can’t be published (${compiled.errors.length} issue(s)): ${summary}`,
        );
      }

      const publishedAt = new Date();
      await tx.flowVersion.update({ where: { id: version.id }, data: { publishedAt } });
      await tx.flow.update({ where: { id: flow.id }, data: { isActive: true } });
      const nextDraft = await tx.flowVersion.create({
        data: {
          tenantId,
          flowId: flow.id,
          version: version.version + 1,
          graph: parsed.data as unknown as Prisma.InputJsonValue,
        },
        select: { version: true },
      });
      return {
        publishedVersion: version.version,
        nextDraftVersion: nextDraft.version,
        publishedAt: publishedAt.toISOString(),
      };
    });
  }

  async getOrCreateDraft(tenantId: string, agentId: string): Promise<FlowDraft> {
    return this.db.withTenant(tenantId, async (tx) => {
      const agent = await tx.agent.findFirst({ where: { id: agentId }, select: { id: true } });
      if (!agent) throw new NotFoundError('Agent not found');

      let flow = await tx.flow.findFirst({
        where: { agentId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!flow) {
        flow = await tx.flow.create({
          data: { tenantId, agentId, name: 'Main flow' },
          select: { id: true },
        });
      }

      let version = await tx.flowVersion.findFirst({
        where: { flowId: flow.id },
        orderBy: { version: 'desc' },
        select: { id: true, version: true, graph: true },
      });
      if (!version) {
        version = await tx.flowVersion.create({
          data: {
            tenantId,
            flowId: flow.id,
            version: 1,
            graph: emptyFlowGraph() as unknown as Prisma.InputJsonValue,
          },
          select: { id: true, version: true, graph: true },
        });
      }

      return {
        flowId: flow.id,
        versionId: version.id,
        version: version.version,
        graph: version.graph,
      };
    });
  }

  /** Autosave: schema-validate + store the graph into the current unpublished version. */
  async saveGraph(tenantId: string, agentId: string, input: unknown): Promise<SaveResult> {
    const parsed = flowGraphSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Invalid flow graph');

    return this.db.withTenant(tenantId, async (tx) => {
      const flow = await tx.flow.findFirst({
        where: { agentId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!flow) throw new NotFoundError('Flow not found — open the builder first');

      const version = await tx.flowVersion.findFirst({
        where: { flowId: flow.id, publishedAt: null },
        orderBy: { version: 'desc' },
        select: { id: true, version: true },
      });
      if (!version) throw new NotFoundError('No editable draft version');

      const updated = await tx.flowVersion.update({
        where: { id: version.id },
        data: { graph: parsed.data as unknown as Prisma.InputJsonValue },
        select: { id: true, version: true },
      });
      return {
        versionId: updated.id,
        version: updated.version,
        savedAt: new Date().toISOString(),
      };
    });
  }
}
