import { describe, expect, it } from 'vitest';
import { type QuotaConfig, evaluateQuota, quotaPolicySchema } from './quota.js';

const hard: QuotaConfig = quotaPolicySchema.parse({ policy: 'hard', warnAt: 0.8 });
const soft: QuotaConfig = quotaPolicySchema.parse({ policy: 'soft', warnAt: 0.8 });
const suspend: QuotaConfig = quotaPolicySchema.parse({
  policy: 'hard',
  warnAt: 0.8,
  onHardOverage: 'suspend',
});

describe('quotaPolicySchema', () => {
  it('defaults sensibly', () => {
    const c = quotaPolicySchema.parse({});
    expect(c.policy).toBe('hard');
    expect(c.warnAt).toBe(0.8);
    expect(c.onHardOverage).toBe('block');
  });
});

describe('evaluateQuota', () => {
  it('allows under the warn line', () => {
    const r = evaluateQuota(50, 100, hard);
    expect(r.state).toBe('ok');
    expect(r.action).toBe('allow');
  });

  it('warns between warnAt and the cap', () => {
    const r = evaluateQuota(85, 100, hard);
    expect(r.state).toBe('warn');
    expect(r.action).toBe('warn');
  });

  it('blocks at the cap under a hard policy', () => {
    const r = evaluateQuota(100, 100, hard);
    expect(r.state).toBe('over');
    expect(r.action).toBe('block');
  });

  it('suspends at the cap when configured', () => {
    expect(evaluateQuota(120, 100, suspend).action).toBe('suspend');
  });

  it('allows overage under a soft policy but flags it', () => {
    const r = evaluateQuota(130, 100, soft);
    expect(r.state).toBe('over');
    expect(r.action).toBe('warn');
  });

  it('treats limit <= 0 as unlimited', () => {
    expect(evaluateQuota(9999, 0, hard).action).toBe('allow');
  });

  it('reports threshold crossings only on transition', () => {
    // previously 70 (ok) → now 85 (warn): crossedWarn true, crossedOver false
    const warn = evaluateQuota(85, 100, hard, 70);
    expect(warn.crossedWarn).toBe(true);
    expect(warn.crossedOver).toBe(false);
    // previously 90 (warn) → now 105 (over): crossedOver true, crossedWarn false
    const over = evaluateQuota(105, 100, hard, 90);
    expect(over.crossedOver).toBe(true);
    expect(over.crossedWarn).toBe(false);
  });
});
