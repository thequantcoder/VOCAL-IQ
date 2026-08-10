import { createHash, randomBytes } from 'node:crypto';
import {
  type AppStatus,
  NotFoundError,
  ValidationError,
  appInstallKey,
  appManifestSchema,
  appPayoutKey,
  appRevSplit,
  canTransitionApp,
  checkPublicHttpUrl,
  isInstallable,
  scanAppManifest,
  scopesSubset,
} from '@vocaliq/shared';
import type { ApiKeyService } from '../api-keys/api-key.service';
import type { PrismaService } from '../db/prisma.service';
import type { WalletService } from '../wallet/wallet.service';

/**
 * Developer app / integration marketplace (Day 84). A developer tenant registers an APP that declares
 * the API scopes it needs + webhook events it subscribes to; the platform reviews + security-scans it;
 * a tenant then INSTALLS it, consenting to a subset of the requested scopes. Installation mints a
 * tenant-scoped API key (Day 48) limited to exactly the consented scopes — so permission enforcement
 * reuses the existing `/v1` scope middleware, and uninstall revokes the key. Paid installs split the
 * fee developer/platform through the audited idempotent wallet (Day 53). Guarantees:
 *  - C: an app is only installable through the review state machine; a security scan blocks
 *    wildcard/unknown scopes before it can go live; consent can never exceed the requested scopes.
 *  - B: apps are creator-RLS-scoped (only approved ones are public, via the admin client + status
 *    gate; the internal webhookUrl/secret/scan are never exposed); the minted key + install live in
 *    the INSTALLER's tenant.
 *  - D: paid installs are exact-split + idempotent (no double-charge); the install is resumable so a
 *    partial failure never charges without delivering the scoped key, and never double-counts.
 */

/** The developer-facing view of their own app (all fields except the hashed secret). */
export interface AppOwnerView {
  id: string;
  name: string;
  description: string;
  homepageUrl: string | null;
  webhookUrl: string | null;
  clientId: string;
  requestedScopes: string[];
  events: string[];
  priceCents: number;
  revShareBps: number;
  status: string;
  scanFindings: unknown;
  installCount: number;
  reviewedAt: Date | null;
  createdAt: Date;
}

interface CreatedApp {
  app: AppOwnerView;
  /** The client secret — returned ONCE at register/rotate, only its sha256 is stored. */
  clientSecret: string;
}

const APP_OWNER_SELECT = {
  id: true,
  name: true,
  description: true,
  homepageUrl: true,
  webhookUrl: true,
  clientId: true,
  requestedScopes: true,
  events: true,
  priceCents: true,
  revShareBps: true,
  status: true,
  scanFindings: true,
  installCount: true,
  reviewedAt: true,
  createdAt: true,
} as const;

/**
 * The public catalogue view — never exposes the secret, the internal webhook URL, the scan, OR the
 * owning developer's tenant id (its RLS scoping column; the install path resolves the developer
 * server-side, so browsers never need it — self-audit B).
 */
const APP_PUBLIC_SELECT = {
  id: true,
  name: true,
  description: true,
  homepageUrl: true,
  clientId: true,
  requestedScopes: true,
  events: true,
  priceCents: true,
  revShareBps: true,
  installCount: true,
  status: true,
  createdAt: true,
} as const;

const INSTALL_SELECT = {
  id: true,
  appId: true,
  grantedScopes: true,
  apiKeyId: true,
  pricePaidCents: true,
  developerCents: true,
  platformCents: true,
  status: true,
  consentedAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

const hashSecret = (raw: string) => createHash('sha256').update(raw).digest('hex');

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

export class DeveloperAppsService {
  constructor(
    private readonly db: PrismaService,
    private readonly apiKeys: ApiKeyService,
    private readonly wallet: WalletService,
  ) {}

  // ── publishing (developer) ────────────────────────────────────────────────────

  /** Register a new app as a draft, minting client credentials (secret shown once). */
  async register(developerTenantId: string, input: unknown): Promise<CreatedApp> {
    const parsed = appManifestSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid app manifest');
    const m = parsed.data;

    // Security scan (self-audit C) — a manifest with blockers (wildcard/unknown scope/event) can't
    // even be created. The webhook URL is SSRF-checked here (the service owns the network boundary).
    const scan = scanAppManifest(m);
    if (!scan.ok) {
      const blockers = scan.findings
        .filter((f) => f.severity === 'blocker')
        .map((f) => f.message)
        .join(' ');
      throw new ValidationError(`App failed the security scan: ${blockers}`);
    }
    if (m.webhookUrl) {
      const u = checkPublicHttpUrl(m.webhookUrl);
      if (!u.ok) throw new ValidationError(`Webhook URL rejected: ${u.reason}`);
    }

    const clientId = `vqapp_${randomBytes(8).toString('hex')}`;
    const clientSecret = `vqsk_${randomBytes(24).toString('hex')}`;

    const app = await this.db.withTenant(developerTenantId, (tx) =>
      tx.developerApp.create({
        data: {
          developerTenantId,
          name: m.name,
          description: m.description,
          ...(m.homepageUrl ? { homepageUrl: m.homepageUrl } : {}),
          ...(m.webhookUrl ? { webhookUrl: m.webhookUrl } : {}),
          clientId,
          hashedSecret: hashSecret(clientSecret),
          requestedScopes: m.requestedScopes,
          events: m.events,
          priceCents: m.priceCents,
          revShareBps: m.revShareBps,
          status: 'draft',
          scanFindings: scan.findings as object,
        },
        select: APP_OWNER_SELECT,
      }),
    );
    return { app: app as AppOwnerView, clientSecret };
  }

  /** The developer's own apps (all statuses). */
  async myApps(developerTenantId: string): Promise<AppOwnerView[]> {
    return this.db.withTenant(developerTenantId, (tx) =>
      tx.developerApp.findMany({ orderBy: { createdAt: 'desc' }, select: APP_OWNER_SELECT }),
    );
  }

  /** Rotate an app's client secret (returns the new secret once). */
  async rotateSecret(developerTenantId: string, id: string): Promise<CreatedApp> {
    const existing = await this.db.withTenant(developerTenantId, (tx) =>
      tx.developerApp.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('App not found');
    const clientSecret = `vqsk_${randomBytes(24).toString('hex')}`;
    const app = await this.db.withTenant(developerTenantId, (tx) =>
      tx.developerApp.update({
        where: { id },
        data: { hashedSecret: hashSecret(clientSecret) },
        select: APP_OWNER_SELECT,
      }),
    );
    return { app: app as AppOwnerView, clientSecret };
  }

  /** Move an app through its developer-side lifecycle (submit draft→pending / revise back to draft). */
  async setStatus(developerTenantId: string, id: string, next: AppStatus): Promise<AppOwnerView> {
    return this.db.withTenant(developerTenantId, async (tx) => {
      const cur = await tx.developerApp.findFirst({
        where: { id },
        select: {
          status: true,
          requestedScopes: true,
          events: true,
          webhookUrl: true,
        },
      });
      if (!cur) throw new NotFoundError('App not found');
      // Developers may submit or revise, but NOT approve/reject/suspend their own app (platform review).
      if (next !== 'pending' && next !== 'draft')
        throw new ValidationError('Only submit (pending) or revise (draft) are developer actions.');
      if (!canTransitionApp(cur.status as AppStatus, next))
        throw new ValidationError(`Cannot move an app from ${cur.status} to ${next}.`);
      // Re-scan on submit — an app can only be submitted for review if it passes the security scan.
      let scanFindings: unknown;
      if (next === 'pending') {
        const scan = scanAppManifest({
          requestedScopes: cur.requestedScopes,
          events: cur.events,
          ...(cur.webhookUrl ? { webhookUrl: cur.webhookUrl } : {}),
        });
        if (!scan.ok)
          throw new ValidationError('App fails the security scan; fix it before submitting.');
        scanFindings = scan.findings;
      }
      return tx.developerApp.update({
        where: { id },
        data: { status: next, ...(scanFindings ? { scanFindings: scanFindings as object } : {}) },
        select: APP_OWNER_SELECT,
      });
    });
  }

  // ── platform review (SUPER_ADMIN — cross-tenant via admin client) ──────────────

  /** Approve / reject a pending app, or suspend an approved one. Platform action (gated at the route). */
  async review(id: string, action: 'approve' | 'reject' | 'suspend') {
    const app = await this.db.admin.developerApp.findUnique({
      where: { id },
      select: { status: true, requestedScopes: true, events: true, webhookUrl: true },
    });
    if (!app) throw new NotFoundError('App not found');
    const next: AppStatus =
      action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'suspended';
    if (!canTransitionApp(app.status as AppStatus, next))
      throw new ValidationError(`Cannot ${action} an app that is ${app.status}.`);
    // Defence: never approve an app that no longer passes the security scan.
    if (next === 'approved') {
      const scan = scanAppManifest({
        requestedScopes: app.requestedScopes,
        events: app.events,
        ...(app.webhookUrl ? { webhookUrl: app.webhookUrl } : {}),
      });
      if (!scan.ok) throw new ValidationError('Cannot approve: the app fails the security scan.');
    }
    return this.db.admin.developerApp.update({
      where: { id },
      data: { status: next, reviewedAt: new Date() },
      select: APP_PUBLIC_SELECT,
    });
  }

  /** All apps awaiting review (platform). */
  async pendingReview(): Promise<AppOwnerView[]> {
    return this.db.admin.developerApp.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: APP_OWNER_SELECT,
    });
  }

  // ── browse (public — approved apps across all tenants) ─────────────────────────

  /** The public catalogue: APPROVED apps from every developer (admin client + status gate). */
  async browse() {
    return this.db.admin.developerApp.findMany({
      where: { status: 'approved' },
      orderBy: [{ installCount: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: APP_PUBLIC_SELECT,
    });
  }

  // ── install + consent (installer) ──────────────────────────────────────────────

  /**
   * Install an approved app: reserve the install (unique per installer+app), charge the installer +
   * pay the developer (paid apps), then mint a tenant-scoped API key limited to the CONSENTED scopes.
   * The reserved row makes the mint happen exactly once; a completed install returns as-is (no key
   * re-mint). Resumable: a partial failure resumes and heals, never charging without delivering.
   *
   * `grantScopes` is the tenant's CONSENT — it must be a subset of the app's requested scopes.
   */
  async install(installerTenantId: string, appId: string, grantScopes?: string[]) {
    const app = await this.db.admin.developerApp.findUnique({
      where: { id: appId },
      select: {
        id: true,
        developerTenantId: true,
        status: true,
        priceCents: true,
        revShareBps: true,
        requestedScopes: true,
        name: true,
      },
    });
    if (!app || !isInstallable(app.status as AppStatus))
      throw new NotFoundError('App not available');
    if (app.developerTenantId === installerTenantId)
      throw new ValidationError('You cannot install your own app.');

    // Consent: default to all requested scopes; never allow granting a scope the app didn't request.
    const granted = grantScopes && grantScopes.length > 0 ? grantScopes : app.requestedScopes;
    if (granted.length === 0) throw new ValidationError('Grant at least one scope to install.');
    if (!scopesSubset(granted, app.requestedScopes))
      throw new ValidationError('You cannot grant a scope the app did not request.');

    const split = appRevSplit(app.priceCents, app.revShareBps);

    // Find or reserve the install row (unique installer+app). A COMPLETED install (apiKeyId set)
    // returns as-is; an INCOMPLETE one is RESUMED (charge replays idempotently, the key is minted
    // once) — so a partial failure never charges without delivering the scoped key (self-audit D).
    let installId: string;
    let justReserved = false;
    const prior = await this.db.withTenant(installerTenantId, (tx) =>
      tx.appInstall.findFirst({ where: { appId }, select: { id: true, apiKeyId: true } }),
    );
    if (prior?.apiKeyId)
      return { install: await this.getInstall(installerTenantId, prior.id), apiKey: null };
    if (prior) {
      installId = prior.id; // resume
    } else {
      try {
        const created = await this.db.withTenant(installerTenantId, (tx) =>
          tx.appInstall.create({
            data: {
              installerTenantId,
              appId,
              grantedScopes: granted,
              pricePaidCents: split.priceCents,
              developerCents: split.developerCents,
              platformCents: split.platformCents,
            },
            select: { id: true },
          }),
        );
        installId = created.id;
        justReserved = true;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const row = await this.db.withTenant(installerTenantId, (tx) =>
          tx.appInstall.findFirst({ where: { appId }, select: { id: true, apiKeyId: true } }),
        );
        if (!row) throw err;
        if (row.apiKeyId)
          return { install: await this.getInstall(installerTenantId, row.id), apiKey: null };
        installId = row.id;
      }
    }

    // Charge the installer + pay the developer (idempotent by the INSTALL-INSTANCE keys, so a resume
    // replays but a genuine reinstall — a fresh install row — charges again). Free apps skip.
    if (split.priceCents > 0) {
      try {
        await this.wallet.debit(installerTenantId, {
          amountCents: split.priceCents,
          key: appInstallKey(installerTenantId, appId, installId),
          reason: 'app_install',
        });
      } catch (err) {
        // A fresh reservation that can't be paid is released so it can be retried; a resumed row is
        // left in place (its charge already posted — a replay, not a new failure).
        if (justReserved) {
          await this.db.withTenant(installerTenantId, (tx) =>
            tx.appInstall.deleteMany({ where: { id: installId } }),
          );
        }
        throw err;
      }
      if (split.developerCents > 0) {
        await this.wallet.topUp(app.developerTenantId, {
          amountCents: split.developerCents,
          key: appPayoutKey(appId, installerTenantId, installId),
          reason: 'app_payout',
        });
      }
    }

    // Mint a scoped API key in the INSTALLER's tenant, limited to exactly the consented scopes. On a
    // resumed attempt this may mint a fresh key (a harmless orphan of the earlier failure — its
    // plaintext was never delivered, so it is inert, and the tenant can revoke it). The tenant always
    // ends with exactly one active key (the one recorded below).
    const minted = await this.apiKeys.create(installerTenantId, {
      name: `app: ${app.name}`,
      scopes: granted,
    });

    // Record the key + activate the install exactly once (apiKeyId null → set). Only the transition
    // winner bumps installCount, so a resumed/raced completion never double-counts (self-audit D).
    const completed = await this.db.withTenant(installerTenantId, (tx) =>
      tx.appInstall.updateMany({
        where: { id: installId, apiKeyId: null },
        data: {
          apiKeyId: minted.id,
          grantedScopes: granted,
          status: 'active',
          consentedAt: new Date(),
        },
      }),
    );
    if (completed.count !== 1) {
      // Another attempt already completed this install — the key we just minted is unused; revoke it.
      await this.apiKeys.revoke(installerTenantId, minted.id);
      return { install: await this.getInstall(installerTenantId, installId), apiKey: null };
    }
    // Best-effort sale-count bump — must NOT block delivery of the shown-once key (a failure here would
    // otherwise strand the installer: charged + active but no key). A rare miss only under-counts a
    // display metric; the count is corrected on the next successful install.
    await this.db.admin.developerApp
      .update({ where: { id: appId }, data: { installCount: { increment: 1 } } })
      .catch(() => {});
    return {
      install: await this.getInstall(installerTenantId, installId),
      // The scoped key the app uses to call /v1 — shown ONCE (the tenant hands it to the developer).
      apiKey: { id: minted.id, prefix: minted.prefix, key: minted.key, scopes: minted.scopes },
    };
  }

  private async getInstall(installerTenantId: string, id: string) {
    const row = await this.db.withTenant(installerTenantId, (tx) =>
      tx.appInstall.findFirst({ where: { id }, select: INSTALL_SELECT }),
    );
    if (!row) throw new NotFoundError('Install not found');
    return row;
  }

  /**
   * The tenant's installed apps, each with its app name/status. The app name is resolved via the admin
   * client (the app is owned by the DEVELOPER tenant, so it's outside the installer's RLS scope — a
   * nested relation read would resolve to null); the installer legitimately sees the name of an app it
   * installed. Only id/name/status are surfaced (no cross-tenant secrets).
   */
  async myInstalls(installerTenantId: string) {
    const installs = await this.db.withTenant(installerTenantId, (tx) =>
      tx.appInstall.findMany({ orderBy: { createdAt: 'desc' }, select: INSTALL_SELECT }),
    );
    if (installs.length === 0) return [];
    const apps = await this.db.admin.developerApp.findMany({
      where: { id: { in: installs.map((i) => i.appId) } },
      select: { id: true, name: true, status: true },
    });
    const byId = new Map(apps.map((a) => [a.id, { name: a.name, status: a.status }]));
    return installs.map((i) => ({ ...i, app: byId.get(i.appId) ?? null }));
  }

  /**
   * Uninstall an app: revoke the minted key (the actual access cut-off), then DELETE the install row so
   * the (installer, app) slot is freed for a future reinstall (self-audit C). The revoke must succeed
   * (or be provably already-gone) BEFORE the row is removed, so a transient revoke failure never
   * reports "uninstalled" while the key is still live. Idempotent: a missing/already-gone install is a
   * no-op.
   */
  async uninstall(installerTenantId: string, appId: string) {
    const row = await this.db.withTenant(installerTenantId, (tx) =>
      tx.appInstall.findFirst({ where: { appId }, select: INSTALL_SELECT }),
    );
    if (!row) throw new NotFoundError('Install not found');

    // Revoke the scoped key FIRST. Only a genuinely already-gone key (NotFound) is tolerated; any other
    // failure aborts before we delete the row, so access is never reported cut while the key stays live.
    if (row.apiKeyId) {
      try {
        await this.apiKeys.revoke(installerTenantId, row.apiKeyId);
      } catch (err) {
        if (!(err instanceof NotFoundError)) throw err;
      }
    }
    await this.db.withTenant(installerTenantId, (tx) =>
      tx.appInstall.deleteMany({ where: { id: row.id } }),
    );
    return { ...row, apiKeyId: null, status: 'revoked', revokedAt: new Date() };
  }
}
