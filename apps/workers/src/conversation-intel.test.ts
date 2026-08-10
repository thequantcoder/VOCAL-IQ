import type { DetectedSignal } from '@vocaliq/shared';
import { describe, expect, it, vi } from 'vitest';
import { type ConvoIntelDeps, runConversationIntel } from './conversation-intel';

/**
 * Conversation-intelligence orchestration (Day 75): fetch → deterministic extract → save. No LLM
 * is ever called (self-audit D — zero added spend); accuracy is tested on the pure extraction.
 */

describe('runConversationIntel', () => {
  it('mines signals from the transcript and saves them (competitor from the watchlist)', async () => {
    const saved: DetectedSignal[] = [];
    const deps: ConvoIntelDeps = {
      fetchContext: async () => ({
        tenantId: 't1',
        text: 'This is too expensive. We use Acme. How much does it cost?',
        competitors: ['Acme'],
      }),
      saveSignals: async (_t, _c, signals) => {
        saved.push(...signals);
      },
      log: () => {},
    };
    const res = await runConversationIntel(deps, 'call1');
    expect(res.status).toBe('ok');
    const types = new Set(saved.map((s) => s.type));
    expect(types.has('objection')).toBe(true);
    expect(types.has('competitor')).toBe(true);
    expect(types.has('buying_signal')).toBe(true);
    expect(saved.find((s) => s.type === 'competitor')?.label).toBe('Acme');
  });

  it('skips an empty transcript (nothing to mine, no work)', async () => {
    const save = vi.fn();
    const res = await runConversationIntel(
      {
        fetchContext: async () => ({ tenantId: 't1', text: '', competitors: [] }),
        saveSignals: save,
        log: () => {},
      },
      'call2',
    );
    expect(res).toEqual({ status: 'empty' });
    expect(save).not.toHaveBeenCalled();
  });

  it('returns not_found for a missing transcript', async () => {
    const res = await runConversationIntel(
      { fetchContext: async () => null, saveSignals: async () => {}, log: () => {} },
      'nope',
    );
    expect(res).toEqual({ status: 'not_found' });
  });
});
