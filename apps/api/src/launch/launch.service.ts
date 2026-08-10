import { type ReadinessReport, evaluateReadiness } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Launch readiness + public status (Day 66). Gathers the live go-live signals from env + the DB
 * and runs the pure `evaluateReadiness` gate; also exposes a minimal PUBLIC status (no sensitive
 * detail) for the status page. Read-only. The readiness report is SUPER_ADMIN-gated at the route.
 */
export class LaunchService {
  constructor(
    private readonly db: PrismaService,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  /** Evaluate the go-live checklist against live signals. */
  async readiness(): Promise<ReadinessReport> {
    const dbOk = await this.dbReachable();
    const has = (k: string) => Boolean(this.env[k]);
    const signals = {
      'billing.live': {
        passed: has('STRIPE_SECRET_KEY'),
        detail: has('STRIPE_SECRET_KEY') ? 'configured' : 'set STRIPE_SECRET_KEY',
      },
      'security.jwt': { passed: has('APP_JWT_SECRET') },
      'security.vault': {
        passed: has('VAULT_MASTER_KEY'),
        detail: has('VAULT_MASTER_KEY') ? 'configured' : 'using dev key — set VAULT_MASTER_KEY',
      },
      'security.cors': { passed: has('CORS_ALLOWED_ORIGINS') },
      // Retention + consent shipped Day 60 — the controls are always available in-app.
      'compliance.retention': { passed: true, detail: 'consent/DNC/retention available' },
      'observability.errors': { passed: has('SENTRY_DSN') },
      'observability.status': { passed: true, detail: '/status page live' },
      'reliability.db': { passed: dbOk },
      // A DR verification is an operator sign-off recorded via env once backups + a restore drill pass.
      'reliability.backups': {
        passed: this.env.BACKUPS_VERIFIED === 'true',
        detail: 'set BACKUPS_VERIFIED=true after a restore drill',
      },
      // Provider fallback (key-pool weighted-LRU + bad-key ejection) ships Day 38 — always active.
      'reliability.providerFallback': { passed: true, detail: 'key-pool ejection active' },
      'scale.region': { passed: has('DATA_REGION') },
    };
    return evaluateReadiness(signals);
  }

  /** Minimal public status — overall + coarse service states, no sensitive detail. */
  async status(): Promise<{
    status: 'operational' | 'degraded';
    services: { name: string; ok: boolean }[];
  }> {
    const dbOk = await this.dbReachable();
    const services = [
      { name: 'api', ok: true },
      { name: 'database', ok: dbOk },
    ];
    return { status: services.every((s) => s.ok) ? 'operational' : 'degraded', services };
  }

  private async dbReachable(): Promise<boolean> {
    try {
      await this.db.admin.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
