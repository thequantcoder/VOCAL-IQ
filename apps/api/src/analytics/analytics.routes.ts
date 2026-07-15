import { ValidationError, buildSimplePdf } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { AnalyticsService } from './analytics.service';

const rangeQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  agentId: z.string().uuid().optional(),
});

const budgetQuery = z.object({
  dailyLimitUsd: z.coerce.number().min(0).optional(),
  monthlyLimitUsd: z.coerce.number().min(0).optional(),
});

/** Analytics API (Day 41). Read-only; open to any member of the tenant (RLS-scoped). */
export function analyticsRoutes(analytics: AnalyticsService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/live',
    ah(async (req, res) => {
      res.json(await analytics.live(req.ctx!.tenantId));
    }),
  );

  r.get(
    '/historical',
    ah(async (req, res) => {
      const parsed = rangeQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError('from and to dates are required');
      const { from, to, agentId } = parsed.data;
      if (to <= from) throw new ValidationError('to must be after from');
      res.json(
        await analytics.historical(req.ctx!.tenantId, {
          from,
          to,
          ...(agentId ? { agentId } : {}),
        }),
      );
    }),
  );

  // Server-side PDF export of the historical summary (FOLLOWUP) — dependency-free, streamed.
  r.get(
    '/historical.pdf',
    ah(async (req, res) => {
      const parsed = rangeQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError('from and to dates are required');
      const { from, to, agentId } = parsed.data;
      if (to <= from) throw new ValidationError('to must be after from');
      const a = await analytics.historical(req.ctx!.tenantId, {
        from,
        to,
        ...(agentId ? { agentId } : {}),
      });
      const day = (d: Date) => d.toISOString().slice(0, 10);
      const totalCost = a.costByDay.reduce((s, p) => s + p.value, 0);
      const lines = [
        `Range: ${day(from)} to ${day(to)}${agentId ? `  ·  agent ${agentId}` : ''}`,
        '',
        `Total calls:       ${a.totalCalls}`,
        `Total minutes:     ${a.totalMinutes}`,
        `Success rate:      ${Math.round(a.successRate * 100)}%`,
        `Total cost:        $${totalCost.toFixed(2)}`,
        `Avg interruptions: ${a.avgInterruptions}`,
        `Drop-off rate:     ${Math.round(a.dropOffRate * 100)}%`,
        '',
        'Outcomes:',
        ...Object.entries(a.outcomes).map(([k, v]) => `  ${k}: ${v}`),
      ];
      const pdf = buildSimplePdf({ title: 'VocalIQ — Analytics summary', lines });
      res.setHeader('content-type', 'application/pdf');
      res.setHeader(
        'content-disposition',
        `attachment; filename="vocaliq-analytics-${day(from)}_${day(to)}.pdf"`,
      );
      res.send(Buffer.from(pdf));
    }),
  );

  r.get(
    '/budget',
    ah(async (req, res) => {
      const parsed = budgetQuery.safeParse(req.query);
      const limits = parsed.success ? parsed.data : {};
      res.json(
        await analytics.budget(req.ctx!.tenantId, {
          ...(limits.dailyLimitUsd !== undefined ? { dailyLimitUsd: limits.dailyLimitUsd } : {}),
          ...(limits.monthlyLimitUsd !== undefined
            ? { monthlyLimitUsd: limits.monthlyLimitUsd }
            : {}),
        }),
      );
    }),
  );

  return r;
}
