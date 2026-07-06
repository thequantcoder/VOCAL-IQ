import { llmCostUsd } from '@vocaliq/provider-router';
import { NotFoundError, Role, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { PrismaService } from '../db/prisma.service';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { RouterService } from '../router/router.service';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { AgentsService } from './agents.service';

const testCompleteSchema = z.object({
  prompt: z.string().min(1).max(8_000),
  system: z.string().max(8_000).optional(),
  model: z.string().max(80).optional(),
});

/** Agents API (Day 14) — RLS-scoped CRUD + a one-off router completion. */
export function agentsRoutes(
  agents: AgentsService,
  router: RouterService,
  db: PrismaService,
  tenants: TenantService,
): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  /** List the tenant's agents (any member — RLS-scoped read). */
  r.get(
    '/',
    ah(async (req, res) => {
      res.json(await agents.list(req.ctx!.tenantId));
    }),
  );

  /** Get one agent (any member — RLS-scoped read). */
  r.get(
    '/:id',
    ah(async (req, res) => {
      res.json(await agents.get(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  /** Create a prompt-based agent (config writers only). */
  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await agents.create(req.ctx!.tenantId, req.body));
    }),
  );

  /** Update an agent (config writers only). */
  r.patch(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await agents.update(req.ctx!.tenantId, req.params.id as string, req.body));
    }),
  );

  /** Read an agent's emotion-aware voice policy (Day 77 — any member, RLS-scoped). */
  r.get(
    '/:id/emotion-policy',
    ah(async (req, res) => {
      res.json(await agents.getEmotionPolicy(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  /** Set an agent's emotion-aware voice policy (config writers only). */
  r.put(
    '/:id/emotion-policy',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await agents.setEmotionPolicy(req.ctx!.tenantId, req.params.id as string, req.body));
    }),
  );

  /**
   * Run a one-off completion through the provider router for an agent in the
   * caller's tenant. Config-writer roles only (BUILDER+); records cost.
   */
  r.post(
    '/:id/test-complete',
    requireRoles(Role.OWNER, Role.ADMIN, Role.BUILDER, Role.RESELLER_ADMIN),
    ah(async (req, res) => {
      const parsed = testCompleteSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('prompt is required (1–8000 chars)');

      // Agent must belong to the active tenant (RLS-scoped read).
      const agent = await db.withTenant(req.ctx!.tenantId, (tx) =>
        tx.agent.findFirst({
          where: { id: req.params.id as string },
          select: { id: true, name: true },
        }),
      );
      if (!agent) throw new NotFoundError('Agent not found');

      const result = await router.complete({
        tenantId: req.ctx!.tenantId,
        agentId: agent.id,
        messages: [{ role: 'user', content: parsed.data.prompt }],
        ...(parsed.data.system ? { system: parsed.data.system } : {}),
        ...(parsed.data.model ? { model: parsed.data.model } : {}),
        maxTokens: 256,
      });

      res.json({
        agentId: agent.id,
        model: result.model,
        text: result.text,
        usage: result.usage,
        costUsd: llmCostUsd(result.model, result.usage.inputTokens, result.usage.outputTokens),
      });
    }),
  );

  return r;
}
