import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import type { WaCallMeter } from './whatsapp-call-cost.service';
import { WhatsAppCallSettingsService } from './whatsapp-call-settings.service';
import { WhatsAppSipService } from './whatsapp-sip.service';

/**
 * WhatsApp SIP mode (WAC-10) against real Postgres + RLS. Adapter is null (gated) so this exercises the
 * offline surface: SIP-mode toggle, x-wa-meta correlation + metering, gated credentials, isolation.
 */
const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff30a001';
const T2 = '00000000-0000-0000-0000-0000ff30a002';

const metered: string[] = [];
const meter: WaCallMeter = {
  meterTerminated: async (_t, id) => {
    metered.push(id);
  },
};
const settings = new WhatsAppCallSettingsService(db, async () => null); // gated adapter → local-only
const sip = new WhatsAppSipService(db, settings, async () => null, meter);

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `wac10-${id.slice(-4)}`,
        slug: `wac10-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
      },
      update: {},
    });
  }
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('WhatsAppSipService', () => {
  it('enables SIP mode and reports it (persisted in settings)', async () => {
    const updated = await sip.configure(T, {
      enabled: true,
      servers: [{ hostname: 'pbx.acme.example', port: 5061 }],
      webhookDelivery: false,
      srtpProtocol: 'SDES',
    });
    expect(updated.sip.enabled).toBe(true);
    expect(updated.sip.servers[0]?.hostname).toBe('pbx.acme.example');
    expect(await sip.isSipMode(T)).toBe(true);
  });

  it('correlates + meters a SIP call from x-wa-meta headers', async () => {
    metered.length = 0;
    const res = await sip.recordSipCall(
      T,
      {
        'X-WA-Meta-WACID': 'wacid.sip.1',
        'x-wa-meta-user-id': 'u9',
        'x-wa-meta-call-duration': '75',
        'x-wa-meta-cta-payload': 'intent=support',
      },
      { direction: 'USER_INITIATED' },
    );
    expect(res?.waCallId).toBe('wacid.sip.1');
    expect(metered).toContain('wacid.sip.1');

    const row = await db.admin.whatsAppCall.findFirst({
      where: { tenantId: T, waCallId: 'wacid.sip.1' },
    });
    expect(row?.status).toBe('completed');
    expect(row?.durationSec).toBe(75);
    expect(row?.waUserId).toBe('u9');
    expect(row?.ctaPayload).toBe('intent=support');
  });

  it('ignores a SIP call with no WACID header', async () => {
    expect(await sip.recordSipCall(T, { via: 'SIP/2.0/TLS x' })).toBeNull();
  });

  it('returns null credentials when the adapter is gated', async () => {
    expect(await sip.credentials(T)).toBeNull();
  });

  it('is tenant-isolated (T2 never sees T’s SIP call)', async () => {
    const seen = await db.withTenant(T2, (tx) =>
      tx.whatsAppCall.findMany({ where: { waCallId: 'wacid.sip.1' } }),
    );
    expect(seen).toHaveLength(0);
  });
});
