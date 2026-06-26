import { describe, expect, it } from 'vitest';
import {
  AppError,
  BillingError,
  ProviderError,
  ValidationError,
  isAppError,
  normalizeError,
  toErrorResponse,
} from './errors.js';

describe('error model', () => {
  it('carries code, status, and a user-safe message', () => {
    const e = new ValidationError('Email already in use');
    expect(e.code).toBe('VALIDATION');
    expect(e.status).toBe(400);
    expect(e.safeMessage).toBe('Email already in use');
    expect(isAppError(e)).toBe(true);
    expect(e.name).toBe('ValidationError');
  });

  it('keeps internal detail separate from the safe message', () => {
    const e = new ProviderError('ElevenLabs 429 rate limited: key sk-abc123', {
      cause: new Error('upstream'),
    });
    expect(e.message).toContain('sk-abc123'); // internal only
    expect(e.safeMessage).toBe('A service is temporarily unavailable.');
    expect(e.status).toBe(502);
  });
});

describe('toErrorResponse', () => {
  it('emits ONLY code + safe message (+ requestId) — never internals', () => {
    const e = new ProviderError('TTS timeout for tenant 42, key sk-secret', {
      cause: new Error('boom'),
      meta: { tenantId: '42' },
    });
    const res = toErrorResponse(e, 'req-123');
    expect(res).toEqual({
      error: {
        code: 'PROVIDER',
        message: 'A service is temporarily unavailable.',
        requestId: 'req-123',
      },
    });
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain('sk-secret');
    expect(serialized).not.toContain('timeout');
    expect(serialized).not.toContain('42');
  });

  it('maps unknown throwables to a generic INTERNAL 500 with no detail', () => {
    const res = toErrorResponse(new Error('DB password=hunter2 leaked'));
    expect(res.error.code).toBe('INTERNAL');
    expect(res.error.message).toBe('Something went wrong.');
    expect(JSON.stringify(res)).not.toContain('hunter2');
  });

  it('omits requestId when not provided', () => {
    const res = toErrorResponse(new BillingError());
    expect(res.error).not.toHaveProperty('requestId');
    expect(res.error.code).toBe('BILLING');
  });
});

describe('normalizeError', () => {
  it('returns AppErrors unchanged', () => {
    const e = new BillingError('Wallet empty');
    expect(normalizeError(e)).toBe(e);
  });

  it('wraps non-AppErrors as INTERNAL, preserving the original as cause', () => {
    const original = new Error('low-level');
    const norm = normalizeError(original);
    expect(norm).toBeInstanceOf(AppError);
    expect(norm.code).toBe('INTERNAL');
    expect(norm.cause).toBe(original);
  });
});
