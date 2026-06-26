import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors.js';
import { err, isErr, isOk, mapResult, ok, tryCatch, tryCatchAsync, unwrap } from './result.js';

describe('Result', () => {
  it('constructs ok/err and narrows with guards', () => {
    const good = ok(42);
    const bad = err(new ValidationError('nope'));
    expect(isOk(good)).toBe(true);
    expect(isErr(bad)).toBe(true);
    if (isOk(good)) expect(good.value).toBe(42);
    if (isErr(bad)) expect(bad.error.code).toBe('VALIDATION');
  });

  it('maps success values and passes errors through untouched', () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
    const e = err(new ValidationError('x'));
    expect(mapResult(e, (n: number) => n * 3)).toBe(e);
  });

  it('unwrap returns the value or throws the error', () => {
    expect(unwrap(ok('hi'))).toBe('hi');
    expect(() => unwrap(err(new ValidationError('boom')))).toThrowError(/boom/);
  });

  it('tryCatch captures throws as a normalised AppError', () => {
    const r = tryCatch(() => {
      throw new Error('kaboom');
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe('INTERNAL');
  });

  it('tryCatchAsync captures rejections', async () => {
    const r = await tryCatchAsync(async () => {
      throw new ValidationError('bad input');
    });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.code).toBe('VALIDATION');
  });
});
