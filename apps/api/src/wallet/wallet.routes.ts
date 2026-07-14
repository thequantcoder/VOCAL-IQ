import { ValidationError, redeemPromoInputSchema } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { WalletService } from './wallet.service';

const topUpSchema = z.object({
  amountCents: z.number().int().positive(),
  key: z.string().min(1).max(120),
  reason: z.string().max(120).optional(),
});

const reconcileQuery = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });

/** Wallet + margin API (Day 53). Reads open to members; top-ups to config writers. RLS-scoped. */
export function walletRoutes(wallet: WalletService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      const [state, ledgerSumCents] = await Promise.all([
        wallet.getBalance(req.ctx!.tenantId),
        wallet.ledgerSumCents(req.ctx!.tenantId),
      ]);
      // reconciled = the cached balance ties out to the append-only ledger sum.
      res.json({ ...state, ledgerSumCents, reconciled: state.balanceCents === ledgerSumCents });
    }),
  );

  r.post(
    '/topup',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = topUpSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError('amountCents (+int) and an idempotency key are required');
      res.json(
        await wallet.topUp(req.ctx!.tenantId, {
          amountCents: parsed.data.amountCents,
          key: parsed.data.key,
          ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
        }),
      );
    }),
  );

  r.get(
    '/reconcile',
    ah(async (req, res) => {
      const parsed = reconcileQuery.safeParse(req.query);
      if (!parsed.success) throw new ValidationError('A period (YYYY-MM) is required');
      res.json(await wallet.reconcile(req.ctx!.tenantId, parsed.data.period));
    }),
  );

  // Promotional / bonus credits (PARITY-08): list the tenant's grants + redeem a promo code.
  r.get(
    '/grants',
    ah(async (req, res) => {
      res.json(await wallet.listGrants(req.ctx!.tenantId));
    }),
  );

  r.post(
    '/redeem',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = redeemPromoInputSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('A promo code is required');
      res.json(await wallet.redeemPromoCode(req.ctx!.tenantId, parsed.data.code));
    }),
  );

  return r;
}
