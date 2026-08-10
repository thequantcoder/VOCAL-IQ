import { describe, expect, it } from 'vitest';
import { LATENCY_SLO } from './latency.js';
import { type FlowFeatures, decideS2sMode, estimateS2sSavingMs } from './speech-to-speech.js';

const simple: FlowFeatures = {
  hasTools: false,
  hasRag: false,
  hasTransfer: false,
  hasComplexBranching: false,
  language: 'en',
};

describe('decideS2sMode (self-audit F)', () => {
  it('uses S2S for a simple, supported-language flow when a provider is available', () => {
    const d = decideS2sMode(simple, true);
    expect(d.mode).toBe('s2s');
    expect(d.eligible).toBe(true);
    expect(d.estimatedSavingMs).toBeGreaterThan(0);
  });

  it('falls back to the pipeline when no provider is configured (gated)', () => {
    const d = decideS2sMode(simple, false);
    expect(d.mode).toBe('pipeline');
    expect(d.reason).toContain('no S2S provider');
  });

  it.each([
    ['hasTools', { hasTools: true }],
    ['hasRag', { hasRag: true }],
    ['hasTransfer', { hasTransfer: true }],
    ['hasComplexBranching', { hasComplexBranching: true }],
  ] as const)('falls back to the pipeline when %s', (_label, override) => {
    const d = decideS2sMode({ ...simple, ...override }, true);
    expect(d.mode).toBe('pipeline');
    expect(d.eligible).toBe(false);
    expect(d.estimatedSavingMs).toBe(0);
  });

  it('falls back for an unsupported language', () => {
    const d = decideS2sMode({ ...simple, language: 'ja' }, true);
    expect(d.mode).toBe('pipeline');
    expect(d.reason).toContain('not supported');
  });

  it('accepts a supported language with a region suffix (en-US)', () => {
    expect(decideS2sMode({ ...simple, language: 'en-US' }, true).mode).toBe('s2s');
  });
});

describe('estimateS2sSavingMs', () => {
  it('removes the STT + TTS first-token legs from the budget', () => {
    expect(estimateS2sSavingMs()).toBe(LATENCY_SLO.stt + LATENCY_SLO.ttsTtfa);
  });
});
