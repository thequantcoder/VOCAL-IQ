import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { PrismaService } from '../db/prisma.service';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { RagService } from './rag.service';

const createKbSchema = z.object({
  name: z.string().min(1).max(120),
  agentId: z.string().uuid().optional(),
});
const ingestSchema = z.object({ text: z.string().min(1).max(200_000) });
const searchSchema = z.object({
  query: z.string().min(1).max(2000),
  k: z.number().int().min(1).max(20).optional(),
});

/** RAG / knowledge-base API — RLS-scoped list/create/ingest/search. */
export function ragRoutes(rag: RagService, db: PrismaService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  /** List the tenant's knowledge bases (any member — RLS-scoped). */
  r.get(
    '/',
    ah(async (req, res) => {
      res.json(
        await db.withTenant(req.ctx!.tenantId, (tx) =>
          tx.knowledgeBase.findMany({
            select: { id: true, name: true, sourceType: true, agentId: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
          }),
        ),
      );
    }),
  );

  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = createKbSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('Knowledge base name is required');
      res.json(
        await rag.createKb(req.ctx!.tenantId, {
          name: parsed.data.name,
          ...(parsed.data.agentId ? { agentId: parsed.data.agentId } : {}),
        }),
      );
    }),
  );

  /** Ingest raw text into a KB (chunk → embed → store). File/URL parsing = follow-up. */
  r.post(
    '/:id/ingest',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = ingestSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('text is required');
      res.json(await rag.ingestText(req.ctx!.tenantId, req.params.id as string, parsed.data.text));
    }),
  );

  /** Preview retrieval for a KB (any member). The Knowledge node uses this at call time. */
  r.post(
    '/:id/search',
    ah(async (req, res) => {
      const parsed = searchSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('query is required');
      res.json(
        await rag.retrieve(
          req.ctx!.tenantId,
          req.params.id as string,
          parsed.data.query,
          parsed.data.k ?? 4,
        ),
      );
    }),
  );

  return r;
}
