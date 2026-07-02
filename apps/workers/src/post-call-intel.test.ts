import type { PostCallIntel } from '@vocaliq/shared';
import { describe, expect, it, vi } from 'vitest';
import { type PostCallDeps, runPostCallIntel } from './post-call-intel';

/** Post-call intel orchestration (Day 31): fetch → prompt → metered LLM → parse → save. */

const INTEL_JSON = JSON.stringify({
  summary: 'Caller booked an appointment for Tuesday.',
  keywords: ['appointment', 'booking'],
  topics: ['scheduling'],
  entities: [{ type: 'date', value: 'Tuesday' }],
  sentiment: 'positive',
  followUps: ['send confirmation'],
});

describe('runPostCallIntel', () => {
  it('summarises + extracts + saves intel (metered LLM path taken)', async () => {
    const saved: PostCallIntel[] = [];
    const complete = vi.fn(async () => INTEL_JSON);
    const deps: PostCallDeps = {
      fetchTranscript: async () => ({
        tenantId: 't1',
        segments: [{ speaker: 'caller', text: 'Book me for Tuesday.' }],
      }),
      complete,
      saveIntel: async (_id, intel) => {
        saved.push(intel);
      },
      log: () => {},
    };
    const res = await runPostCallIntel(deps, 'tr1');
    expect(res).toEqual({ status: 'ok', keywords: 2, topics: 1 });
    expect(complete).toHaveBeenCalledOnce(); // the metered LLM call happened
    expect(saved[0]?.summary).toContain('appointment');
    expect(saved[0]?.entities[0]).toEqual({ type: 'date', value: 'Tuesday' });
  });

  it('skips the LLM entirely for an empty transcript (no wasted spend)', async () => {
    const complete = vi.fn(async () => INTEL_JSON);
    const res = await runPostCallIntel(
      {
        fetchTranscript: async () => ({ tenantId: 't1', segments: [] }),
        complete,
        saveIntel: async () => {},
        log: () => {},
      },
      'tr2',
    );
    expect(res).toEqual({ status: 'empty' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns not_found for a missing transcript', async () => {
    const res = await runPostCallIntel(
      {
        fetchTranscript: async () => null,
        complete: vi.fn(),
        saveIntel: async () => {},
        log: () => {},
      },
      'nope',
    );
    expect(res).toEqual({ status: 'not_found' });
  });

  it('still saves (empty) intel when the model returns garbage', async () => {
    const saved: PostCallIntel[] = [];
    const res = await runPostCallIntel(
      {
        fetchTranscript: async () => ({ tenantId: 't1', segments: [{ text: 'hi' }] }),
        complete: async () => 'the model refused',
        saveIntel: async (_id, intel) => {
          saved.push(intel);
        },
        log: () => {},
      },
      'tr3',
    );
    expect(res.status).toBe('ok');
    expect(saved[0]?.summary).toBe('');
    expect(saved[0]?.keywords).toEqual([]);
  });
});
