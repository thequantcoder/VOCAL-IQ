import { ValidationError, qaRubricInputSchema } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { QaService } from './qa.service';

const aggregateQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  agentId: z.string().uuid().optional(),
});

const rubricUpdateSchema = qaRubricInputSchema.partial();

/**
 * QA scoring API (Day 43). Reads (rubrics, scores, aggregate) open to any tenant member;
 * rubric mutations + on-demand scoring are config-writer actions (scoring spends LLM budget).
 * Every call is RLS-scoped.
 */
export function qaRoutes(qa: QaService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/rubrics',
    ah(async (req, res) => {
      res.json(await qa.listRubrics(req.ctx!.tenantId));
    }),
  );

  r.post(
    '/rubrics',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = qaRubricInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid rubric');
      res.status(201).json(await qa.createRubric(req.ctx!.tenantId, parsed.data));
    }),
  );

  r.patch(
    '/rubrics/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = rubricUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid update');
      res.json(await qa.updateRubric(req.ctx!.tenantId, req.params.id as string, parsed.data));
    }),
  );

  r.delete(
    '/rubrics/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await qa.deleteRubric(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.get(
    '/aggregate',
    ah(async (req, res) => {
      const parsed = aggregateQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError('Invalid aggregate filters');
      const { from, to, agentId } = parsed.data;
      if (from && to && to <= from) throw new ValidationError('to must be after from');
      res.json(
        await qa.aggregate(req.ctx!.tenantId, {
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(agentId ? { agentId } : {}),
        }),
      );
    }),
  );

  r.get(
    '/calls/:callId/scores',
    ah(async (req, res) => {
      res.json(await qa.scoresForCall(req.ctx!.tenantId, req.params.callId as string));
    }),
  );

  r.post(
    '/calls/:callId/score',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await qa.scoreCallNow(req.ctx!.tenantId, req.params.callId as string));
    }),
  );

  return r;
}
