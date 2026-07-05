import { describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { LaunchService } from './launch.service';

/**
 * Launch readiness + status (Day 66). Proves the go-live gate reflects live signals: a fully
 * configured prod-like env is GO; a bare env is NO-GO (fail-closed on unset blockers). DB-backed.
 */

const db = new PrismaService();

// The readiness gate only checks presence (Boolean(env[key])), so these are obvious dummies —
// not real secrets — to keep the gitleaks scan clean.
const prodEnv = {
  STRIPE_SECRET_KEY: 'fake-stripe-value',
  APP_JWT_SECRET: 'a-long-enough-secret-value',
  VAULT_MASTER_KEY: 'fake-vault-master-value',
  CORS_ALLOWED_ORIGINS: 'https://app.vocaliq.dev',
  SENTRY_DSN: 'https://x@sentry.example/1',
  BACKUPS_VERIFIED: 'true',
  DATA_REGION: 'us-east-1',
} as NodeJS.ProcessEnv;

describe('LaunchService.readiness', () => {
  it('is GO with a fully configured prod-like env', async () => {
    const svc = new LaunchService(db, prodEnv);
    const r = await svc.readiness();
    expect(r.go).toBe(true);
    expect(r.blockersFailed).toBe(0);
  });

  it('is NO-GO with a bare env (blockers unset → fail closed)', async () => {
    const svc = new LaunchService(db, {} as NodeJS.ProcessEnv);
    const r = await svc.readiness();
    expect(r.go).toBe(false);
    expect(r.blockersFailed).toBeGreaterThan(0);
    // The billing + vault blockers should be among the failures.
    const failedKeys = r.results.filter((x) => !x.passed).map((x) => x.item.key);
    expect(failedKeys).toContain('billing.live');
    expect(failedKeys).toContain('security.vault');
  });
});

describe('LaunchService.status (public)', () => {
  it('reports operational when the DB is reachable', async () => {
    const svc = new LaunchService(db, prodEnv);
    const s = await svc.status();
    expect(s.status).toBe('operational');
    expect(s.services.find((x) => x.name === 'database')?.ok).toBe(true);
  });
});
