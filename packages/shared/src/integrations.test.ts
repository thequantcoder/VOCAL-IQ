import { describe, expect, it } from 'vitest';
import {
  hubspotContactProps,
  integrationConnectSchema,
  mapCallToSync,
  splitName,
} from './integrations.js';

describe('splitName', () => {
  it('splits into first/last, handles single + empty', () => {
    expect(splitName('Ada Lovelace')).toEqual({ firstName: 'Ada', lastName: 'Lovelace' });
    expect(splitName('Ada')).toEqual({ firstName: 'Ada' });
    expect(splitName('  ')).toEqual({});
    expect(splitName('Mary Ann Evans')).toEqual({ firstName: 'Mary', lastName: 'Ann Evans' });
  });
});

describe('mapCallToSync', () => {
  it('maps a qualified positive call to a full payload', () => {
    const p = mapCallToSync({
      contact: {
        name: 'Ada Lovelace',
        email: 'ada@x.com',
        phone: '+14155550100',
        fields: { company: 'Analytical Engines' },
      },
      lead: { status: 'QUALIFIED', score: 82 },
      transcript: { summary: 'Wants a demo next week.', sentiment: 'positive', keywords: ['demo'] },
    });
    expect(p.contact).toEqual({
      email: 'ada@x.com',
      phone: '+14155550100',
      firstName: 'Ada',
      lastName: 'Lovelace',
      company: 'Analytical Engines',
    });
    expect(p.leadStatus).toBe('QUALIFIED');
    expect(p.leadScore).toBe(82);
    expect(p.note).toContain('qualified');
    expect(p.note).toContain('Wants a demo');
    expect(p.openTicket).toBe(false);
  });

  it('degrades gracefully with no lead/transcript', () => {
    const p = mapCallToSync({ contact: { phone: '+1999' } });
    expect(p.leadStatus).toBe('NEW');
    expect(p.leadScore).toBe(0);
    expect(p.sentiment).toBeNull();
    expect(p.contact).toEqual({ phone: '+1999' });
  });

  it('opens a ticket only on a negative call when ticketOnNegative is set', () => {
    const neg = { contact: { phone: '+1' }, transcript: { sentiment: 'negative' } };
    expect(mapCallToSync({ ...neg, ticketOnNegative: true }).openTicket).toBe(true);
    expect(mapCallToSync({ ...neg, ticketOnNegative: false }).openTicket).toBe(false);
    expect(
      mapCallToSync({
        contact: { phone: '+1' },
        transcript: { sentiment: 'positive' },
        ticketOnNegative: true,
      }).openTicket,
    ).toBe(false);
  });
});

describe('hubspotContactProps', () => {
  it('flattens to HubSpot properties + maps lead status', () => {
    const props = hubspotContactProps(
      mapCallToSync({
        contact: { name: 'Ada Lovelace', email: 'ada@x.com' },
        lead: { status: 'HOT', score: 90 },
        transcript: { summary: 'Ready to buy.', sentiment: 'positive' },
      }),
    );
    expect(props.email).toBe('ada@x.com');
    expect(props.firstname).toBe('Ada');
    expect(props.lastname).toBe('Lovelace');
    expect(props.hs_lead_status).toBe('OPEN_DEAL'); // HOT → OPEN_DEAL
    expect(props.vocaliq_last_call).toContain('Ready to buy');
  });
});

describe('integrationConnectSchema', () => {
  it('requires a plausible token + valid type', () => {
    expect(
      integrationConnectSchema.safeParse({ type: 'HUBSPOT', accessToken: 'pat-na1-abcdefgh' })
        .success,
    ).toBe(true);
    expect(integrationConnectSchema.safeParse({ type: 'HUBSPOT', accessToken: 'x' }).success).toBe(
      false,
    );
    expect(
      integrationConnectSchema.safeParse({ type: 'NOPE', accessToken: 'longenough' }).success,
    ).toBe(false);
  });
});
