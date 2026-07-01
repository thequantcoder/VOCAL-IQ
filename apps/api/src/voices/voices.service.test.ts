import { isAppError } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type VoiceCloner, VoicesService } from './voices.service';

/**
 * Voice library + gated cloning (Day 26), against real Postgres (RLS-scoped). A fake
 * cloner stands in for ElevenLabs so CI never makes a live call. Proves: presets are
 * visible, settings persist, and a fresh clone is UNUSABLE until approved (the gate).
 */

const db = new PrismaService();
let cloneCalls = 0;
const fakeCloner: VoiceCloner = {
  provider: 'ELEVENLABS',
  async clone() {
    cloneCalls++;
    return { providerVoiceId: `cloned-${cloneCalls}` };
  },
};
const svc = new VoicesService(db, fakeCloner);
const C1 = '00000000-0000-0000-0000-000000000003';
const NOW = '2026-07-01T00:00:00.000Z';
const createdIds: string[] = [];
const createdAgents: string[] = [];

afterAll(async () => {
  await db.admin.agent.deleteMany({ where: { id: { in: createdAgents } } });
  await db.admin.voice.deleteMany({ where: { id: { in: createdIds } } });
});

describe('VoicesService', () => {
  it('lists public presets and applies filters', async () => {
    const all = await svc.list(C1, {});
    const presets = all.filter((v) => v.isPreset);
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.every((v) => v.usable)).toBe(true); // presets are always usable

    const females = await svc.list(C1, { gender: 'female' });
    expect(females.length).toBeGreaterThan(0);
    expect(females.every((v) => v.gender === 'female')).toBe(true);
  });

  it('persists tuning settings on a tenant voice but rejects editing presets', async () => {
    const v = await db.admin.voice.create({
      data: {
        tenantId: C1,
        provider: 'ELEVENLABS',
        providerVoiceId: 'tenant-voice-1',
        name: 'House Voice',
        isCloned: false,
        approved: true,
      },
      select: { id: true },
    });
    createdIds.push(v.id);

    const updated = await svc.updateSettings(C1, v.id, { stability: 0.9, pace: 1.2 });
    expect(updated.settings.stability).toBe(0.9);
    expect(updated.settings.pace).toBe(1.2);

    // Re-read to confirm persistence.
    const reread = await svc.get(C1, v.id);
    expect(reread.settings.stability).toBe(0.9);

    // Presets (tenantId = null) are read-only.
    const preset = (await svc.list(C1, {})).find((x) => x.isPreset);
    expect(preset).toBeDefined();
    await expect(svc.updateSettings(C1, preset?.id ?? '', { stability: 0.1 })).rejects.toSatisfy(
      isAppError,
    );
  });

  it('clones with mandatory consent, stores consentRef, and gates use until approved', async () => {
    const clone = await svc.clone(
      C1,
      {
        name: 'Founder Clone',
        language: 'en',
        gender: 'male',
        sampleUrls: ['https://example.com/sample1.mp3'],
        consent: {
          consentGiven: true,
          subjectName: 'Jane Founder',
          statement: 'I consent to cloning my voice for this agent.',
        },
      },
      NOW,
    );
    createdIds.push(clone.id);
    expect(clone.isCloned).toBe(true);
    expect(clone.approved).toBe(false);
    expect(clone.usable).toBe(false); // the gate: unapproved clone is unusable

    // Consent is persisted for audit.
    const raw = await db.admin.voice.findUnique({
      where: { id: clone.id },
      select: { consentRef: true },
    });
    expect((raw?.consentRef as { subjectName: string }).subjectName).toBe('Jane Founder');
    expect((raw?.consentRef as { consentedAt: string }).consentedAt).toBe(NOW);

    // An agent cannot be assigned an unapproved clone.
    const agent = await db.admin.agent.create({
      data: { tenantId: C1, name: 'Voice Test Agent' },
      select: { id: true },
    });
    createdAgents.push(agent.id);
    await expect(svc.assignToAgent(C1, agent.id, { defaultVoiceId: clone.id })).rejects.toSatisfy(
      isAppError,
    );

    // Approve → now usable and assignable.
    const approved = await svc.approve(C1, clone.id);
    expect(approved.approved).toBe(true);
    expect(approved.usable).toBe(true);

    const assigned = await svc.assignToAgent(C1, agent.id, { defaultVoiceId: clone.id });
    expect(assigned.defaultVoiceId).toBe(clone.id);
  });

  it('rejects a clone without explicit consent', async () => {
    await expect(
      svc.clone(
        C1,
        {
          name: 'No Consent',
          sampleUrls: ['https://example.com/sample1.mp3'],
          consent: { consentGiven: false, subjectName: 'X', statement: 'nope' },
        },
        NOW,
      ),
    ).rejects.toSatisfy(isAppError);
  });
});
