import { z } from 'zod';
import { API_SCOPES, type ApiScope, WEBHOOK_EVENTS, hasScope } from './public-api.js';

/**
 * Developer app / integration marketplace (Day 84) — pure domain shared across api/web.
 *
 * A third-party developer registers an APP that declares the API scopes it needs (from the Day-48
 * catalogue) and the webhook events it subscribes to. The platform REVIEWS + security-scans it; a
 * tenant then INSTALLS it, explicitly CONSENTING to a subset of the requested scopes — installation
 * mints a tenant-scoped API key limited to exactly those scopes, so permission enforcement reuses the
 * existing `/v1` scope middleware (uninstall revokes the key). Apps may be paid (one-time install fee,
 * split developer/platform via {@link appRevSplit}). Four properties matter:
 *  - C (scopes/consent/review/security, self-audit C): an app is only installable through an explicit
 *    review state machine ({@link canTransitionApp}, {@link isInstallable}); a security scan
 *    ({@link scanAppManifest}) blocks wildcard/unknown scopes + unknown events before it can go live;
 *    and consent can never exceed what the app requested ({@link scopesSubset}).
 *  - B (isolation): the minted key + install live in the INSTALLER's tenant; drafts/installs stay
 *    private; only approved apps are public.
 *  - D (money): paid installs split exact integer cents (developer + platform === price).
 * Everything here is pure + deterministic (no crypto/DB), so it unit-tests without a server.
 */

// ── app review lifecycle (self-audit C) ───────────────────────────────────────

/** draft → pending (submit) → approved | rejected; approved → suspended; rejected/suspended → draft. */
export const APP_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'suspended'] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

const APP_TRANSITIONS: Record<AppStatus, AppStatus[]> = {
  draft: ['pending'],
  pending: ['approved', 'rejected'],
  approved: ['suspended'],
  rejected: ['draft'],
  suspended: ['draft'],
};

/** Is an app status change legal? (the review/approval gate — self-audit C). */
export function canTransitionApp(from: AppStatus, to: AppStatus): boolean {
  return (APP_TRANSITIONS[from] ?? []).includes(to);
}

/** Only an approved app can be installed. */
export function isInstallable(status: AppStatus): boolean {
  return status === 'approved';
}

// ── scopes + consent (self-audit C) ───────────────────────────────────────────

/**
 * Scopes a third-party app may request — the Day-48 API catalogue. The `*` wildcard is deliberately
 * NOT here: a third-party app must enumerate exactly what it needs (the scan blocks wildcards).
 */
export const APP_SCOPES = API_SCOPES;

/** Scopes that grant costly/abusable actions — surfaced to the installer + flagged in review. */
export const HIGH_RISK_SCOPES: readonly ApiScope[] = ['calls:write'];

export function isAppScope(v: string): v is ApiScope {
  return (API_SCOPES as readonly string[]).includes(v);
}

/** Consent can never exceed the request: every granted scope must be one the app asked for. */
export function scopesSubset(granted: string[], requested: string[]): boolean {
  const req = new Set(requested);
  return granted.every((s) => req.has(s));
}

/** Whether an install's granted scopes satisfy a required API scope (an app never holds `*`). */
export function installGrantsScope(granted: string[], required: ApiScope): boolean {
  return hasScope(granted, required);
}

// ── manifest + validation ─────────────────────────────────────────────────────

export const appManifestSchema = z.object({
  name: z.string().min(3).max(80),
  description: z.string().max(2000).default(''),
  homepageUrl: z.string().url().max(500).optional(),
  webhookUrl: z.string().url().max(500).optional(),
  requestedScopes: z.array(z.string()).min(1).max(API_SCOPES.length),
  events: z.array(z.string()).max(WEBHOOK_EVENTS.length).default([]),
  priceCents: z.number().int().min(0).max(1_000_000_00),
  revShareBps: z.number().int().min(0).max(10_000).default(7000),
});
export type AppManifest = z.infer<typeof appManifestSchema>;

// ── security scan (self-audit C) ──────────────────────────────────────────────

export type ScanSeverity = 'blocker' | 'warning';
export interface ScanFinding {
  severity: ScanSeverity;
  code: string;
  message: string;
}
export interface ScanReport {
  /** True when there are no blocker findings — the app may be submitted / approved. */
  ok: boolean;
  findings: ScanFinding[];
}

/**
 * Security-scan an app manifest before it can be submitted or approved (self-audit C). Deterministic
 * + pure (URL SSRF is checked separately in the service, which owns DNS/network). BLOCKS: a wildcard
 * scope (a third-party app must enumerate what it needs), an unknown scope or event, or requesting no
 * scopes. WARNS: high-risk scopes (e.g. placing calls), or an event subscription with no webhook URL
 * to deliver to (and vice-versa). `ok` is false iff any blocker is present.
 */
export function scanAppManifest(
  m: Pick<AppManifest, 'requestedScopes' | 'events' | 'webhookUrl'>,
): ScanReport {
  const findings: ScanFinding[] = [];

  if (m.requestedScopes.includes('*')) {
    findings.push({
      severity: 'blocker',
      code: 'wildcard_scope',
      message: 'A third-party app cannot request the "*" wildcard scope; enumerate exact scopes.',
    });
  }
  if (m.requestedScopes.length === 0) {
    findings.push({
      severity: 'blocker',
      code: 'no_scopes',
      message: 'An app must request at least one scope.',
    });
  }
  for (const s of m.requestedScopes) {
    if (s !== '*' && !isAppScope(s)) {
      findings.push({
        severity: 'blocker',
        code: 'unknown_scope',
        message: `Unknown scope "${s}".`,
      });
    }
  }
  for (const e of m.events) {
    if (!(WEBHOOK_EVENTS as readonly string[]).includes(e)) {
      findings.push({
        severity: 'blocker',
        code: 'unknown_event',
        message: `Unknown event "${e}".`,
      });
    }
  }
  for (const s of m.requestedScopes) {
    if (isAppScope(s) && HIGH_RISK_SCOPES.includes(s)) {
      findings.push({
        severity: 'warning',
        code: 'high_risk_scope',
        message: `Scope "${s}" grants a costly/abusable action; review carefully.`,
      });
    }
  }
  if (m.events.length > 0 && !m.webhookUrl) {
    findings.push({
      severity: 'warning',
      code: 'events_without_webhook',
      message: 'Event subscriptions have no webhook URL to deliver to.',
    });
  }
  if (m.webhookUrl && m.events.length === 0) {
    findings.push({
      severity: 'warning',
      code: 'webhook_without_events',
      message: 'A webhook URL is set but the app subscribes to no events.',
    });
  }

  return { ok: !findings.some((f) => f.severity === 'blocker'), findings };
}

// ── revenue split + idempotency keys (self-audit D) ───────────────────────────

export interface AppRevSplit {
  priceCents: number;
  /** What the developer earns (price × revShareBps, rounded). */
  developerCents: number;
  /** What the platform keeps (the exact remainder — developer + platform === price). */
  platformCents: number;
}

/**
 * Split a paid install fee between the developer and the platform. `revShareBps` is the DEVELOPER's
 * share in basis points (7000 = 70%). The platform gets the exact remainder, so the two ALWAYS sum to
 * the price — no rounding cent created or lost (self-audit D). Pure.
 */
export function appRevSplit(priceCents: number, revShareBps: number): AppRevSplit {
  const price = Math.max(0, Math.round(priceCents));
  const bps = Math.min(10_000, Math.max(0, Math.round(revShareBps)));
  const developerCents = Math.round((price * bps) / 10_000);
  return { priceCents: price, developerCents, platformCents: price - developerCents };
}

/**
 * Idempotency key for an install charge. Scoped to the install ROW id (not just installer+app) so a
 * resume/retry of the SAME install replays (no double-charge), while a genuine REINSTALL after an
 * uninstall — which creates a fresh install row — charges again instead of replaying the old ledger
 * entry (self-audit D). A tenant pays once per install instance.
 */
export function appInstallKey(installerTenantId: string, appId: string, installId: string): string {
  return `app_install:${installerTenantId}:${appId}:${installId}`;
}
/** Idempotency key for the developer's payout of an install (also install-instance-scoped). */
export function appPayoutKey(appId: string, installerTenantId: string, installId: string): string {
  return `app_payout:${appId}:${installerTenantId}:${installId}`;
}
