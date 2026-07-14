import { isAppError } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { CampaignsService } from './campaigns.service';

/**
 * Campaign manager (Day 28), against real Postgres (RLS-scoped). Proves: create binds a
 * tenant agent, CSV import dedupes + suppresses DNC + enrolls contacts, status transitions
 * are gated, and the monitor reports live counts.
 */

const db = new PrismaService();
const svc = new CampaignsService(db);
const C1 = '00000000-0000-0000-0000-000000000003';
const createdCampaigns: string[] = [];
const createdAgents: string[] = [];
const createdContacts: string[] = [];

afterAll(async () => {
  await db.admin.campaign.deleteMany({ where: { id: { in: createdCampaigns } } });
  await db.admin.contact.deleteMany({ where: { id: { in: createdContacts } } });
  await db.admin.agent.deleteMany({ where: { id: { in: createdAgents } } });
});

async function makeAgent(): Promise<string> {
  const a = await db.admin.agent.create({
    data: { tenantId: C1, name: 'Campaign Agent' },
    select: { id: true },
  });
  createdAgents.push(a.id);
  return a.id;
}

describe('CampaignsService', () => {
  it('creates a campaign, imports contacts (dedupe + DNC), and monitors counts', async () => {
    const agentId = await makeAgent();

    // Seed a DNC contact the import must suppress.
    const blocked = await db.admin.contact.create({
      data: { tenantId: C1, phone: '+14155559999', dnc: true },
      select: { id: true },
    });
    createdContacts.push(blocked.id);

    const campaign = await svc.create(C1, {
      name: 'Summer Outreach',
      agentId,
      pacing: 10,
      concurrency: 5,
    });
    createdCampaigns.push(campaign.id);
    expect(campaign.status).toBe('DRAFT');

    const csv = [
      'phone,name,email',
      '+14155550100,Ada,ada@x.com',
      '+1 415 555 0100,Ada Dup,', // duplicate
      '+14155550101,Grace,grace@x.com',
      '+14155559999,Blocked,', // DNC → suppressed
      'garbage,Bad,', // invalid
    ].join('\n');

    const summary = await svc.import(C1, campaign.id, {
      csv,
      mapping: { phone: 'phone', name: 'name', email: 'email' },
    });
    expect(summary.imported).toBe(2);
    expect(summary.duplicates).toBe(1);
    expect(summary.suppressed).toBe(1);
    expect(summary.invalid).toBe(1);

    // Track the two contacts created for cleanup.
    const enrolled = await db.admin.campaignContact.findMany({
      where: { campaignId: campaign.id },
      select: { contactId: true },
    });
    createdContacts.push(...enrolled.map((e) => e.contactId));

    const monitor = await svc.monitor(C1, campaign.id);
    expect(monitor.total).toBe(2);
    expect(monitor.byStatus.PENDING).toBe(2);
  });

  it('gates illegal status transitions', async () => {
    const agentId = await makeAgent();
    const campaign = await svc.create(C1, { name: 'Transitions', agentId });
    createdCampaigns.push(campaign.id);

    // DRAFT → COMPLETED is illegal.
    await expect(svc.setStatus(C1, campaign.id, 'COMPLETED')).rejects.toSatisfy(isAppError);

    // DRAFT → RUNNING → PAUSED is fine.
    const running = await svc.setStatus(C1, campaign.id, 'RUNNING');
    expect(running.status).toBe('RUNNING');
    const paused = await svc.setStatus(C1, campaign.id, 'PAUSED');
    expect(paused.status).toBe('PAUSED');
  });

  it('rejects creating a campaign with a foreign agent', async () => {
    await expect(
      svc.create(C1, { name: 'Bad', agentId: '00000000-0000-0000-0000-0000000000ff' }),
    ).rejects.toSatisfy(isAppError);
  });

  it('re-queues FAILED contacts to RETRY (PARITY-10 retry knob)', async () => {
    const agentId = await makeAgent();
    const campaign = await svc.create(C1, { name: 'Retry', agentId });
    createdCampaigns.push(campaign.id);

    // Enroll 3 contacts: 2 FAILED, 1 COMPLETED (must be left alone).
    const mk = async (phone: string, status: string) => {
      const c = await db.admin.contact.create({
        data: { tenantId: C1, phone },
        select: { id: true },
      });
      createdContacts.push(c.id);
      await db.admin.campaignContact.create({
        data: { tenantId: C1, campaignId: campaign.id, contactId: c.id, status },
      });
    };
    await mk('+14155550201', 'FAILED');
    await mk('+14155550202', 'FAILED');
    await mk('+14155550203', 'COMPLETED');

    const res = await svc.retryFailed(C1, campaign.id);
    expect(res.requeued).toBe(2);

    const monitor = await svc.monitor(C1, campaign.id);
    expect(monitor.byStatus.RETRY).toBe(2); // the two failed → RETRY
    expect(monitor.byStatus.COMPLETED).toBe(1); // untouched
    expect(monitor.byStatus.FAILED).toBeUndefined();
  });

  it('rejects retrying a non-existent campaign', async () => {
    await expect(svc.retryFailed(C1, '00000000-0000-0000-0000-0000000000fe')).rejects.toSatisfy(
      isAppError,
    );
  });
});
