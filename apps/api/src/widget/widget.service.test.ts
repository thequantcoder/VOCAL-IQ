import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { RateLimiter } from './rate-limiter';
import { type TokenMinter, WidgetService } from './widget.service';

/**
 * Public widget session backend (real Postgres). Self-audit focus C+B: only a PUBLISHED
 * agent yields a session, sessions are rate-limited, and the WEB Call is tenant-scoped.
 */

const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const WT = '00000000-0000-0000-0000-0000005a0001';
const AGENT_PUB = '00000000-0000-0000-0000-0000005a0002';
const AGENT_DRAFT = '00000000-0000-0000-0000-0000005a0003';

const fakeMinter: TokenMinter = async (room, identity) => ({
  token: `tok-${room}-${identity}`,
  serverUrl: 'wss://test.livekit.cloud',
});

function svc(max = 5) {
  return new WidgetService(db, new RateLimiter(max, 60_000, () => 0), fakeMinter);
}

beforeAll(async () => {
  const a = db.admin;
  await a.tenant.upsert({
    where: { id: WT },
    create: {
      id: WT,
      type: 'CUSTOMER',
      parentTenantId: PLATFORM,
      name: 'Widget T',
      slug: 'widget-t',
      status: 'ACTIVE',
      branding: { color: '#7C5CFF' },
    },
    update: { branding: { color: '#7C5CFF' } },
  });
  await a.agent.upsert({
    where: { id: AGENT_PUB },
    create: { id: AGENT_PUB, tenantId: WT, name: 'Web Agent', status: 'PUBLISHED' },
    update: { status: 'PUBLISHED' },
  });
  await a.agent.upsert({
    where: { id: AGENT_DRAFT },
    create: { id: AGENT_DRAFT, tenantId: WT, name: 'Draft Agent', status: 'DRAFT' },
    update: { status: 'DRAFT' },
  });
});

afterAll(async () => {
  const a = db.admin;
  await a.call.deleteMany({ where: { tenantId: WT } });
  await a.agent.deleteMany({ where: { tenantId: WT } });
  await a.tenant.deleteMany({ where: { id: WT } });
});

describe('WidgetService.createSession', () => {
  it('opens a WEB call + mints a token for a published agent', async () => {
    const session = await svc().createSession(AGENT_PUB, '1.2.3.4');
    expect(session.agentName).toBe('Web Agent');
    expect(session.room).toBe(`web-${session.callId}`);
    expect(session.token).toContain(`visitor-${session.callId}`);
    expect(session.serverUrl).toBe('wss://test.livekit.cloud');

    const call = await db.admin.call.findUnique({ where: { id: session.callId } });
    expect(call?.channel).toBe('WEB');
    expect(call?.direction).toBe('INBOUND');
    expect(call?.tenantId).toBe(WT);
  });

  it('refuses an unpublished agent', async () => {
    await expect(svc().createSession(AGENT_DRAFT, '1.2.3.4')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
  });

  it('refuses an unknown agent', async () => {
    await expect(
      svc().createSession('00000000-0000-0000-0000-0000009e9999', '1.2.3.4'),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'NOT_FOUND');
  });

  it('rate-limits repeated sessions from the same caller', async () => {
    const s = svc(2); // max 2 per window
    await s.createSession(AGENT_PUB, '9.9.9.9');
    await s.createSession(AGENT_PUB, '9.9.9.9');
    await expect(s.createSession(AGENT_PUB, '9.9.9.9')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'RATE_LIMIT',
    );
  });
});

describe('WidgetService.config', () => {
  it('returns the agent name + tenant branding', async () => {
    const cfg = await svc().config(AGENT_PUB);
    expect(cfg.name).toBe('Web Agent');
    expect((cfg.branding as { color: string }).color).toBe('#7C5CFF');
  });
});
