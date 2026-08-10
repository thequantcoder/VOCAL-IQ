import { describe, expect, it } from 'vitest';
import {
  type AppStatus,
  appInstallKey,
  appManifestSchema,
  appPayoutKey,
  appRevSplit,
  canTransitionApp,
  installGrantsScope,
  isInstallable,
  scanAppManifest,
  scopesSubset,
} from './developer-app.js';

describe('app review state machine (self-audit C)', () => {
  it('allows only the legal transitions', () => {
    expect(canTransitionApp('draft', 'pending')).toBe(true);
    expect(canTransitionApp('pending', 'approved')).toBe(true);
    expect(canTransitionApp('pending', 'rejected')).toBe(true);
    expect(canTransitionApp('approved', 'suspended')).toBe(true);
    expect(canTransitionApp('rejected', 'draft')).toBe(true);
    expect(canTransitionApp('suspended', 'draft')).toBe(true);
    // illegal jumps
    expect(canTransitionApp('draft', 'approved')).toBe(false);
    expect(canTransitionApp('approved', 'pending')).toBe(false);
    expect(canTransitionApp('draft', 'suspended')).toBe(false);
  });
  it('only approved apps are installable', () => {
    const statuses: AppStatus[] = ['draft', 'pending', 'approved', 'rejected', 'suspended'];
    expect(statuses.filter(isInstallable)).toEqual(['approved']);
  });
});

describe('scanAppManifest (self-audit C — security scan)', () => {
  it('passes a clean manifest', () => {
    const r = scanAppManifest({
      requestedScopes: ['agents:read', 'leads:read'],
      events: ['lead.created'],
      webhookUrl: 'https://app.example.com/hook',
    });
    expect(r.ok).toBe(true);
    expect(r.findings.filter((f) => f.severity === 'blocker')).toHaveLength(0);
  });
  it('BLOCKS a wildcard scope (a third-party app must enumerate scopes)', () => {
    const r = scanAppManifest({ requestedScopes: ['*'], events: [] });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.code === 'wildcard_scope')).toBe(true);
  });
  it('BLOCKS unknown scopes + unknown events', () => {
    const r = scanAppManifest({
      requestedScopes: ['agents:read', 'billing:admin'],
      events: ['made.up.event'],
      webhookUrl: 'https://x.example.com',
    });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.code === 'unknown_scope')).toBe(true);
    expect(r.findings.some((f) => f.code === 'unknown_event')).toBe(true);
  });
  it('WARNS (but does not block) on a high-risk scope', () => {
    const r = scanAppManifest({ requestedScopes: ['calls:write'], events: [] });
    expect(r.ok).toBe(true); // warning only
    expect(r.findings.some((f) => f.code === 'high_risk_scope' && f.severity === 'warning')).toBe(
      true,
    );
  });
  it('WARNS on events without a webhook and a webhook without events', () => {
    const noHook = scanAppManifest({ requestedScopes: ['leads:read'], events: ['lead.created'] });
    expect(noHook.findings.some((f) => f.code === 'events_without_webhook')).toBe(true);
    const noEvents = scanAppManifest({
      requestedScopes: ['leads:read'],
      events: [],
      webhookUrl: 'https://x.example.com',
    });
    expect(noEvents.findings.some((f) => f.code === 'webhook_without_events')).toBe(true);
  });
});

describe('consent / scope subset (self-audit C)', () => {
  it('consent can never exceed the requested scopes', () => {
    expect(scopesSubset(['agents:read'], ['agents:read', 'leads:read'])).toBe(true);
    expect(scopesSubset(['agents:read', 'leads:read'], ['agents:read', 'leads:read'])).toBe(true);
    expect(scopesSubset(['calls:write'], ['agents:read'])).toBe(false); // asked for more than granted
    expect(scopesSubset([], ['agents:read'])).toBe(true); // empty grant is a subset
  });
  it('installGrantsScope reflects the granted set (no wildcard for apps)', () => {
    expect(installGrantsScope(['agents:read'], 'agents:read')).toBe(true);
    expect(installGrantsScope(['agents:read'], 'leads:read')).toBe(false);
  });
});

describe('appManifestSchema', () => {
  it('accepts a valid manifest and rejects a too-short name', () => {
    expect(
      appManifestSchema.safeParse({
        name: 'CRM Sync',
        requestedScopes: ['leads:read'],
        priceCents: 0,
      }).success,
    ).toBe(true);
    expect(
      appManifestSchema.safeParse({ name: 'no', requestedScopes: ['leads:read'], priceCents: 0 })
        .success,
    ).toBe(false);
    expect(
      appManifestSchema.safeParse({ name: 'CRM Sync', requestedScopes: [], priceCents: 0 }).success,
    ).toBe(false);
  });
});

describe('appRevSplit (self-audit D — exact, sums to price)', () => {
  it('splits by the developer basis points', () => {
    expect(appRevSplit(10000, 7000)).toEqual({
      priceCents: 10000,
      developerCents: 7000,
      platformCents: 3000,
    });
  });
  it('the platform gets the exact remainder for a spread of odd values (property)', () => {
    for (const price of [1, 7, 99, 333, 12345, 999999]) {
      for (const bps of [0, 1, 2500, 3333, 6667, 9999, 10000]) {
        const s = appRevSplit(price, bps);
        expect(s.developerCents + s.platformCents).toBe(price);
        expect(s.developerCents).toBeGreaterThanOrEqual(0);
        expect(s.platformCents).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('install idempotency keys', () => {
  it('are stable + distinct per installer/app/install-instance', () => {
    expect(appInstallKey('t1', 'a1', 'i1')).toBe('app_install:t1:a1:i1');
    expect(appPayoutKey('a1', 't1', 'i1')).toBe('app_payout:a1:t1:i1');
    expect(appInstallKey('t1', 'a1', 'i1')).not.toBe(appInstallKey('t2', 'a1', 'i1'));
    // A reinstall (new install row id) yields a DISTINCT key so it charges again, not a replay.
    expect(appInstallKey('t1', 'a1', 'i1')).not.toBe(appInstallKey('t1', 'a1', 'i2'));
  });
});
