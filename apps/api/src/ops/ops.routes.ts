import { Role, TICKET_PRIORITIES, TICKET_STATUSES, ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { OpsService } from './ops.service';

const ticketCreate = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().max(4000).default(''),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});
const creditAdd = z.object({
  cents: z.number().int().positive(),
  kind: z.enum(['prepaid', 'bonus']).default('prepaid'),
});
const broadcast = z.object({
  tenantIds: z.array(z.string().uuid()).min(1),
  message: z.string().min(1).max(500),
});

/**
 * SaaS ops toolkit API (Day 49). Reads open to members; tenant mutations to config writers;
 * platform actions (number KYC, broadcast) to SUPER_ADMIN. All RLS-scoped.
 */
export function opsRoutes(ops: OpsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  // ── Tickets ──
  r.get(
    '/tickets',
    ah(async (req, res) => {
      res.json(await ops.listTickets(req.ctx!.tenantId, req.query.status as string | undefined));
    }),
  );
  r.post(
    '/tickets',
    ah(async (req, res) => {
      const p = ticketCreate.safeParse(req.body);
      if (!p.success) throw new ValidationError(p.error.issues[0]?.message ?? 'Invalid ticket');
      res.status(201).json(
        await ops.createTicket(req.ctx!.tenantId, {
          subject: p.data.subject,
          body: p.data.body,
          ...(p.data.priority ? { priority: p.data.priority } : {}),
        }),
      );
    }),
  );
  r.patch(
    '/tickets/:id/assign',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(
        await ops.assignTicket(
          req.ctx!.tenantId,
          req.params.id as string,
          (req.body?.assignee as string) ?? null,
        ),
      );
    }),
  );
  r.patch(
    '/tickets/:id/status',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const status = z.enum(TICKET_STATUSES).safeParse(req.body?.status);
      if (!status.success) throw new ValidationError('A valid status is required');
      res.json(await ops.setTicketStatus(req.ctx!.tenantId, req.params.id as string, status.data));
    }),
  );

  // ── Credits ──
  r.get(
    '/credits',
    ah(async (req, res) => {
      res.json(await ops.getWallet(req.ctx!.tenantId));
    }),
  );
  r.post(
    '/credits/add',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = creditAdd.safeParse(req.body);
      if (!p.success) throw new ValidationError('cents (positive int) is required');
      res.json(await ops.addCredits(req.ctx!.tenantId, p.data.cents, p.data.kind));
    }),
  );

  // ── Number pool + KYC ──
  r.get(
    '/numbers',
    ah(async (req, res) => {
      res.json(await ops.listNumbers(req.ctx!.tenantId));
    }),
  );
  r.post(
    '/numbers/:id/assign',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const agentId = z.string().uuid().safeParse(req.body?.agentId);
      if (!agentId.success) throw new ValidationError('agentId is required');
      res.json(await ops.assignNumber(req.ctx!.tenantId, req.params.id as string, agentId.data));
    }),
  );
  r.post(
    '/numbers/:id/release',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await ops.releaseNumber(req.ctx!.tenantId, req.params.id as string));
    }),
  );
  r.post(
    '/numbers/:id/kyc',
    requireRoles(Role.SUPER_ADMIN),
    ah(async (req, res) => {
      res.json(await ops.setKyc(req.params.id as string, req.body?.verified !== false));
    }),
  );

  // ── Notifications ──
  r.get(
    '/notifications',
    ah(async (req, res) => {
      res.json(await ops.listNotifications(req.ctx!.tenantId));
    }),
  );
  r.post(
    '/notifications/:id/read',
    ah(async (req, res) => {
      res.json(await ops.markRead(req.ctx!.tenantId, req.params.id as string));
    }),
  );
  r.post(
    '/notifications/broadcast',
    requireRoles(Role.SUPER_ADMIN),
    ah(async (req, res) => {
      const p = broadcast.safeParse(req.body);
      if (!p.success) throw new ValidationError('tenantIds + message are required');
      res.json(await ops.broadcast(p.data.tenantIds, p.data.message));
    }),
  );

  // ── Trials ──
  r.get(
    '/trials',
    ah(async (req, res) => {
      res.json(await ops.getTrialLimits(req.ctx!.tenantId));
    }),
  );
  r.put(
    '/trials',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await ops.setTrialLimits(req.ctx!.tenantId, req.body));
    }),
  );

  return r;
}
