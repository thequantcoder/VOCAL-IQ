import { Role } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type Actor, ResidencyService } from './residency.service';

/**
 * Data residency (Day 61) against real Postgres. Proves region pinning + routing: a tenant's
 * pinned region drives the resolved storage/voice endpoints, defaults fall back to the platform
 * region, and setting residency is audited + tenant-isolated (self-audit B/C).
 */

const db = new PrismaService();
const svc = new ResidencyService(db, { DATA_REGION: 'us-east-1' } as NodeJS.ProcessEnv);

const C1 = '00000000-0000-0000-0000-000000000003'; // seed customer
const OWNER: Actor = {
  userId: '00000000-0000-0000-0000-0000061a000a',
  tenantId: C1,
  role: Role.OWNER,
};

afterAll(async () => {
  await db.admin.auditLog.deleteMany({ where: { action: 'residency.set' } });
  await db.admin.tenant.update({ where: { id: C1 }, data: { settings: {} } });
});

describe('ResidencyService', () => {
  it('defaults to the platform region when unpinned', async () => {
    const r = await svc.resolve(C1);
    expect(r.region).toBe('us-east-1');
    expect(r.storageHost).toContain('us-east-1');
  });

  it('pins a tenant to a region and routes endpoints there (audited)', async () => {
    const cfg = await svc.setResidency(OWNER, { region: 'eu-west-1', strictEgress: true });
    expect(cfg.region).toBe('eu-west-1');

    const r = await svc.resolve(C1);
    expect(r.region).toBe('eu-west-1');
    expect(r.storageHost).toContain('eu-west-1');
    expect(r.voiceHost).toContain('eu-west-1');
    expect(r.strictEgress).toBe(true);

    const audit = await db.admin.auditLog.findFirst({
      where: { action: 'residency.set', tenantId: C1 },
    });
    expect(audit?.target).toBe('eu-west-1');
  });

  it('rejects an unknown region', async () => {
    await expect(svc.setResidency(OWNER, { region: 'mars-1' })).rejects.toThrow();
  });

  it('rejects a non-admin', async () => {
    await expect(
      svc.setResidency({ ...OWNER, role: Role.AGENT }, { region: 'eu-west-1' }),
    ).rejects.toThrow();
  });
});
