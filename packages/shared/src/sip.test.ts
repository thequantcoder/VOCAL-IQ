import { describe, expect, it } from 'vitest';
import {
  SIP_PROVIDER_TEMPLATES,
  applyTemplate,
  maskSipUsername,
  sipTemplate,
  sipTrunkCreateSchema,
} from './sip.js';

describe('SIP provider templates', () => {
  it('ships 13+ carrier templates with unique ids incl. custom', () => {
    expect(SIP_PROVIDER_TEMPLATES.length).toBeGreaterThanOrEqual(13);
    const ids = SIP_PROVIDER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['twilio', 'telnyx', 'plivo', 'vonage', 'bandwidth', 'custom']) {
      expect(ids).toContain(id);
    }
  });
});

describe('applyTemplate', () => {
  it('fills carrier defaults, and overrides win', () => {
    const base = applyTemplate({
      providerTemplate: 'telnyx',
      name: 't',
      inbound: true,
      outbound: true,
      concurrencyLimit: 10,
      credentials: { authUsername: 'u', authPassword: 'p' },
    });
    expect(base.host).toBe(sipTemplate('telnyx')?.host);
    expect(base.transport).toBe('TLS');

    const overridden = applyTemplate({
      providerTemplate: 'telnyx',
      name: 't',
      host: 'sip.custom.example',
      port: 5080,
      transport: 'UDP',
      inbound: true,
      outbound: true,
      concurrencyLimit: 10,
      credentials: { authUsername: 'u', authPassword: 'p' },
    });
    expect(overridden.host).toBe('sip.custom.example');
    expect(overridden.port).toBe(5080);
    expect(overridden.transport).toBe('UDP');
  });

  it('treats an unknown template as custom', () => {
    const r = applyTemplate({
      providerTemplate: 'nope',
      name: 't',
      host: 'sip.byo.example',
      inbound: true,
      outbound: true,
      concurrencyLimit: 10,
      credentials: { authUsername: 'u', authPassword: 'p' },
    });
    expect(r.host).toBe('sip.byo.example');
    expect(r.port).toBe(5060);
  });

  it('marks Zadarma as registration-required', () => {
    expect(sipTemplate('zadarma')?.registrationRequired).toBe(true);
  });
});

describe('sipTrunkCreateSchema', () => {
  it('requires credentials and a template', () => {
    expect(
      sipTrunkCreateSchema.safeParse({
        providerTemplate: 'twilio',
        name: 'T',
        credentials: { authUsername: 'u', authPassword: 'p' },
      }).success,
    ).toBe(true);
    expect(sipTrunkCreateSchema.safeParse({ providerTemplate: 'twilio', name: 'T' }).success).toBe(
      false,
    );
  });
});

describe('maskSipUsername', () => {
  it('never reveals the full username', () => {
    expect(maskSipUsername('acct_12345')).toContain('ac');
    expect(maskSipUsername('acct_12345')).not.toContain('12345');
    expect(maskSipUsername('ab')).toBe('••');
  });
});
