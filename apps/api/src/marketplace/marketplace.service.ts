import {
  type ListingStatus,
  NotFoundError,
  ValidationError,
  canTransitionListing,
  isPurchasable,
  listingInputSchema,
  payoutKey,
  purchaseKey,
  revShareSplit,
  reviewInputSchema,
} from '@vocaliq/shared';
import type { AgentsService } from '../agents/agents.service';
import type { PrismaService } from '../db/prisma.service';
import type { FlowsService } from '../flows/flows.service';
import type { WalletService } from '../wallet/wallet.service';

/**
 * Agent-template marketplace (Day 83). Creators publish a snapshot of an agent (persona + flow) as a
 * paid listing; the platform reviews it; buyers purchase + clone it into their OWN tenant; the price
 * splits between creator and platform. Guarantees: money flows through the audited idempotent wallet
 * (debit buyer, credit creator — no double-charge), the price split is exact (creator+platform=price),
 * a listing only becomes buyable through the review state machine, and every clone lands in the
 * BUYER's tenant (isolation). Cross-tenant browse of APPROVED listings uses the admin client with a
 * status gate; everything else is RLS-scoped.
 */

interface Snapshot {
  name: string;
  systemPrompt: string;
  type: string;
  languages: string[];
  graph: unknown;
}

const LISTING_PUBLIC = {
  id: true,
  creatorTenantId: true,
  title: true,
  description: true,
  priceCents: true,
  revShareBps: true,
  status: true,
  ratingSum: true,
  ratingCount: true,
  purchaseCount: true,
  createdAt: true,
} as const;

const PURCHASE_SELECT = {
  id: true,
  listingId: true,
  pricePaidCents: true,
  creatorCents: true,
  platformCents: true,
  clonedAgentId: true,
  createdAt: true,
} as const;

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

export class MarketplaceService {
  constructor(
    private readonly db: PrismaService,
    private readonly wallet: WalletService,
    private readonly agents: AgentsService,
    private readonly flows: FlowsService,
  ) {}

  // ── publishing (creator) ──────────────────────────────────────────────────────

  /** Publish a snapshot of one of the creator's agents as a draft listing (persona + flow captured now). */
  async publish(creatorTenantId: string, input: unknown) {
    const parsed = listingInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid listing');
    const d = parsed.data;

    // The source agent must belong to the creator (agents.get is RLS-scoped → NotFound otherwise).
    const agent = await this.agents.get(creatorTenantId, d.sourceAgentId);
    const draft = await this.flows.getOrCreateDraft(creatorTenantId, d.sourceAgentId);
    const snapshot: Snapshot = {
      name: agent.name,
      systemPrompt: (agent.persona as { systemPrompt?: string } | null)?.systemPrompt ?? '',
      type: agent.type,
      languages: agent.languages,
      graph: draft.graph,
    };

    return this.db.withTenant(creatorTenantId, (tx) =>
      tx.marketplaceListing.create({
        data: {
          creatorTenantId,
          sourceAgentId: d.sourceAgentId,
          title: d.title,
          description: d.description,
          priceCents: d.priceCents,
          status: 'draft',
          snapshot: snapshot as object,
        },
        select: LISTING_PUBLIC,
      }),
    );
  }

  /** The creator's own listings (all statuses). */
  async myListings(creatorTenantId: string) {
    return this.db.withTenant(creatorTenantId, (tx) =>
      tx.marketplaceListing.findMany({ orderBy: { createdAt: 'desc' }, select: LISTING_PUBLIC }),
    );
  }

  /** Move a listing through its lifecycle (creator submits draft→pending / revises rejected→draft). */
  async setStatus(creatorTenantId: string, id: string, next: ListingStatus) {
    return this.db.withTenant(creatorTenantId, async (tx) => {
      const cur = await tx.marketplaceListing.findFirst({
        where: { id },
        select: { status: true },
      });
      if (!cur) throw new NotFoundError('Listing not found');
      // Creators may submit or re-draft, but NOT approve their own listing (that's platform review).
      if (next === 'approved' || next === 'rejected')
        throw new ValidationError('Approval is a platform action.');
      if (!canTransitionListing(cur.status as ListingStatus, next))
        throw new ValidationError(`Cannot move a listing from ${cur.status} to ${next}.`);
      return tx.marketplaceListing.update({
        where: { id },
        data: { status: next },
        select: LISTING_PUBLIC,
      });
    });
  }

  // ── platform review (SUPER_ADMIN — cross-tenant via admin client) ──────────────

  /** Approve or reject a pending listing. Platform-operator action (gated at the route). */
  async review(id: string, action: 'approve' | 'reject') {
    const listing = await this.db.admin.marketplaceListing.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!listing) throw new NotFoundError('Listing not found');
    const next: ListingStatus = action === 'approve' ? 'approved' : 'rejected';
    if (!canTransitionListing(listing.status as ListingStatus, next))
      throw new ValidationError(`Cannot ${action} a listing that is ${listing.status}.`);
    return this.db.admin.marketplaceListing.update({
      where: { id },
      data: { status: next, reviewedAt: new Date() },
      select: LISTING_PUBLIC,
    });
  }

  /** All listings awaiting review (platform). */
  async pendingReview() {
    return this.db.admin.marketplaceListing.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: LISTING_PUBLIC,
    });
  }

  // ── browse (public — approved listings across all tenants) ─────────────────────

  /** The public catalogue: APPROVED listings from every creator (admin client + status gate). */
  async browse() {
    return this.db.admin.marketplaceListing.findMany({
      where: { status: 'approved' },
      orderBy: [{ purchaseCount: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: LISTING_PUBLIC,
    });
  }

  // ── purchase + clone (buyer) ────────────────────────────────────────────────────

  /**
   * Buy an approved listing: reserve the purchase (unique per buyer+listing → idempotent), charge the
   * buyer + pay the creator through the wallet, then clone the snapshot into the BUYER's tenant. The
   * reserved row makes the clone happen exactly once; a replay returns the existing purchase.
   */
  async purchase(buyerTenantId: string, listingId: string) {
    const listing = await this.db.admin.marketplaceListing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        creatorTenantId: true,
        status: true,
        priceCents: true,
        revShareBps: true,
        snapshot: true,
      },
    });
    if (!listing || !isPurchasable(listing.status as ListingStatus))
      throw new NotFoundError('Listing not available');
    if (listing.creatorTenantId === buyerTenantId)
      throw new ValidationError('You cannot purchase your own listing.');

    const split = revShareSplit(listing.priceCents, listing.revShareBps);

    // Find or reserve the purchase row (unique buyer+listing). A COMPLETED purchase (clonedAgentId
    // set) returns as-is; an INCOMPLETE one (a prior attempt failed mid-way) is RESUMED — the wallet
    // ops replay idempotently and the clone runs once — so a partial failure never leaves the buyer
    // charged without delivery (self-audit D).
    let purchaseId: string;
    let justReserved = false;
    const prior = await this.db.withTenant(buyerTenantId, (tx) =>
      tx.marketplacePurchase.findFirst({
        where: { listingId },
        select: { id: true, clonedAgentId: true },
      }),
    );
    if (prior?.clonedAgentId) return this.getPurchase(buyerTenantId, prior.id);
    if (prior) {
      purchaseId = prior.id; // resume
    } else {
      try {
        const created = await this.db.withTenant(buyerTenantId, (tx) =>
          tx.marketplacePurchase.create({
            data: {
              buyerTenantId,
              listingId,
              pricePaidCents: split.priceCents,
              creatorCents: split.creatorCents,
              platformCents: split.platformCents,
            },
            select: { id: true },
          }),
        );
        purchaseId = created.id;
        justReserved = true;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Concurrent create won the race — resume from its row.
        const row = await this.db.withTenant(buyerTenantId, (tx) =>
          tx.marketplacePurchase.findFirst({
            where: { listingId },
            select: { id: true, clonedAgentId: true },
          }),
        );
        if (!row) throw err;
        if (row.clonedAgentId) return this.getPurchase(buyerTenantId, row.id);
        purchaseId = row.id;
      }
    }

    // Charge the buyer + pay the creator (idempotent by the purchase/payout keys). Free listings skip.
    if (split.priceCents > 0) {
      try {
        await this.wallet.debit(buyerTenantId, {
          amountCents: split.priceCents,
          key: purchaseKey(buyerTenantId, listingId),
          reason: 'marketplace_purchase',
        });
      } catch (err) {
        // A fresh reservation that can't be paid is released so it can be retried; a resumed row is
        // left in place (its charge already posted — a replay, not a new failure).
        if (justReserved) {
          await this.db.withTenant(buyerTenantId, (tx) =>
            tx.marketplacePurchase.deleteMany({ where: { id: purchaseId } }),
          );
        }
        throw err;
      }
      if (split.creatorCents > 0) {
        await this.wallet.topUp(listing.creatorTenantId, {
          amountCents: split.creatorCents,
          key: payoutKey(listingId, buyerTenantId),
          reason: 'marketplace_payout',
        });
      }
    }

    // Clone the snapshot into the BUYER's tenant (isolation). The early return above already handled a
    // completed purchase, so clonedAgentId is null here and we clone now. On a RESUMED attempt (a prior
    // try died after cloning but before marking complete) this may create a fresh draft agent — a
    // harmless orphan: it lives in the buyer's OWN tenant, moved no money, and the buyer still ends with
    // exactly one working clone (the one we mark below).
    const snap = listing.snapshot as unknown as Snapshot;
    const agent = await this.agents.create(buyerTenantId, {
      name: snap.name || 'Purchased agent',
      systemPrompt: snap.systemPrompt ?? '',
      type: (['INBOUND', 'OUTBOUND', 'MIXED'].includes(snap.type) ? snap.type : 'INBOUND') as
        | 'INBOUND'
        | 'OUTBOUND'
        | 'MIXED',
      languages: snap.languages ?? [],
      status: 'DRAFT',
    });
    await this.flows.getOrCreateDraft(buyerTenantId, agent.id);
    if (snap.graph) await this.flows.saveGraph(buyerTenantId, agent.id, snap.graph);

    // Mark the purchase complete exactly once (clonedAgentId null → set). ONLY the row that wins that
    // transition bumps the listing's sale count, so a resumed or concurrently-raced completion never
    // double-counts purchaseCount (self-audit D — the metric feeds payouts + browse ranking).
    const completed = await this.db.withTenant(buyerTenantId, (tx) =>
      tx.marketplacePurchase.updateMany({
        where: { id: purchaseId, clonedAgentId: null },
        data: { clonedAgentId: agent.id },
      }),
    );
    if (completed.count === 1) {
      await this.db.admin.marketplaceListing.update({
        where: { id: listingId },
        data: { purchaseCount: { increment: 1 } },
      });
    }
    return this.getPurchase(buyerTenantId, purchaseId);
  }

  private async getPurchase(buyerTenantId: string, id: string) {
    const row = await this.db.withTenant(buyerTenantId, (tx) =>
      tx.marketplacePurchase.findFirst({ where: { id }, select: PURCHASE_SELECT }),
    );
    if (!row) throw new NotFoundError('Purchase not found');
    return row;
  }

  /** The buyer's purchases. */
  async myPurchases(buyerTenantId: string) {
    return this.db.withTenant(buyerTenantId, (tx) =>
      tx.marketplacePurchase.findMany({ orderBy: { createdAt: 'desc' }, select: PURCHASE_SELECT }),
    );
  }

  // ── reviews + payouts ──────────────────────────────────────────────────────────

  /** Rate a listing you bought (one review per buyer per listing). Recomputes the listing's rating. */
  async rate(buyerTenantId: string, listingId: string, input: unknown) {
    const parsed = reviewInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid review');

    const bought = await this.db.withTenant(buyerTenantId, (tx) =>
      tx.marketplacePurchase.findFirst({ where: { listingId }, select: { id: true } }),
    );
    if (!bought) throw new ValidationError('You can only review a listing you purchased.');

    await this.db.withTenant(buyerTenantId, (tx) =>
      tx.marketplaceReview.upsert({
        where: { buyerTenantId_listingId: { buyerTenantId, listingId } },
        create: {
          buyerTenantId,
          listingId,
          rating: parsed.data.rating,
          ...(parsed.data.comment ? { comment: parsed.data.comment } : {}),
        },
        update: {
          rating: parsed.data.rating,
          ...(parsed.data.comment ? { comment: parsed.data.comment } : {}),
        },
      }),
    );

    // Recompute the listing's rating from all its reviews (cross-tenant → admin).
    const agg = await this.db.admin.marketplaceReview.aggregate({
      where: { listingId },
      _sum: { rating: true },
      _count: { _all: true },
    });
    return this.db.admin.marketplaceListing.update({
      where: { id: listingId },
      data: { ratingSum: agg._sum.rating ?? 0, ratingCount: agg._count._all },
      select: LISTING_PUBLIC,
    });
  }

  /** A creator's earnings: total paid out + purchase count across their listings. */
  async payouts(creatorTenantId: string) {
    const listings = await this.db.withTenant(creatorTenantId, (tx) =>
      tx.marketplaceListing.findMany({ select: { id: true } }),
    );
    const ids = listings.map((l) => l.id);
    if (ids.length === 0) return { earnedCents: 0, sales: 0 };
    const agg = await this.db.admin.marketplacePurchase.aggregate({
      where: { listingId: { in: ids } },
      _sum: { creatorCents: true },
      _count: { _all: true },
    });
    return { earnedCents: agg._sum.creatorCents ?? 0, sales: agg._count._all };
  }
}
