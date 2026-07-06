import { describe, expect, it } from 'vitest';
import {
  type CustomModelProfile,
  canCreateCustomModel,
  customModelSchema,
  resolveModelRouting,
} from './custom-models.js';

describe('canCreateCustomModel (consent gate — self-audit C)', () => {
  it('refuses without explicit consent', () => {
    expect(canCreateCustomModel({}).ok).toBe(false);
    expect(canCreateCustomModel({ consent: { consentGiven: false } }).ok).toBe(false);
  });
  it('refuses when the consent record is incomplete', () => {
    expect(canCreateCustomModel({ consent: { consentGiven: true, consentText: 'ok' } }).ok).toBe(
      false,
    );
    expect(canCreateCustomModel({ consent: { consentGiven: true, consentedBy: 'Jane' } }).ok).toBe(
      false,
    );
  });
  it('allows with a complete consent record', () => {
    expect(
      canCreateCustomModel({
        consent: { consentGiven: true, consentedBy: 'Jane', consentText: 'Trained on our data.' },
      }).ok,
    ).toBe(true);
  });
});

describe('customModelSchema', () => {
  it('requires consentGiven: true (a false/absent consent is rejected)', () => {
    expect(() =>
      customModelSchema.parse({
        name: 'Brand',
        provider: 'OPENAI',
        baseModel: 'gpt-4o',
        consent: { consentGiven: false },
      }),
    ).toThrow();
    const ok = customModelSchema.parse({
      name: 'Brand',
      provider: 'OPENAI',
      baseModel: 'gpt-4o',
      consent: { consentGiven: true, consentedBy: 'Jane', consentText: 'Yes' },
    });
    expect(ok.requestFineTune).toBe(false); // default
  });
});

describe('resolveModelRouting (pure routing)', () => {
  const base: CustomModelProfile = {
    provider: 'OPENAI',
    baseModel: 'gpt-4o',
    fineTuneId: null,
    systemPrompt: 'Speak in the ACME brand voice.',
    status: 'ready',
  };

  it('routes a customised (no fine-tune) model to the base model + brand prompt', () => {
    const r = resolveModelRouting(base);
    expect(r).toEqual({
      provider: 'OPENAI',
      model: 'gpt-4o',
      system: 'Speak in the ACME brand voice.',
    });
  });

  it('routes a ready fine-tune to its provider fine-tune id', () => {
    const r = resolveModelRouting({ ...base, fineTuneId: 'ft:gpt-4o:acme:123' });
    expect(r.model).toBe('ft:gpt-4o:acme:123');
  });

  it('does NOT use a fine-tune id until the model is ready', () => {
    const r = resolveModelRouting({ ...base, fineTuneId: 'ft:pending', status: 'training' });
    expect(r.model).toBe('gpt-4o');
  });
});
