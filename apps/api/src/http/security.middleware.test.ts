import { describe, expect, it } from 'vitest';
import { corsMiddleware, parseCorsAllowlist, securityHeaders } from './security.middleware';

/**
 * Security headers + CORS regression suite (Day 64, self-audit C). Locks in the defensive headers
 * and the CORS allow-list behaviour so a regression can't silently drop protections.
 */

function fakeRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let ended = false;
  return {
    headers,
    get statusCode() {
      return statusCode;
    },
    get ended() {
      return ended;
    },
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    status(c: number) {
      statusCode = c;
      return this;
    },
    end() {
      ended = true;
      return this;
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal Express Response stub for the test
  } as any;
}

describe('securityHeaders', () => {
  it('sets the defensive header set on every response', () => {
    const res = fakeRes();
    let called = false;
    securityHeaders()({} as never, res, () => {
      called = true;
    });
    expect(called).toBe(true);
    expect(res.headers['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['X-Frame-Options']).toBe('DENY');
    expect(res.headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(res.headers['Referrer-Policy']).toBe('no-referrer');
    expect(res.headers['Permissions-Policy']).toContain('camera=()');
  });
});

describe('CORS allow-list', () => {
  it('parses the env list', () => {
    expect(
      parseCorsAllowlist({
        CORS_ALLOWED_ORIGINS: 'https://a.com, https://b.com',
      } as NodeJS.ProcessEnv),
    ).toEqual(['https://a.com', 'https://b.com']);
    expect(parseCorsAllowlist({} as NodeJS.ProcessEnv)).toEqual([]);
  });

  it('reflects only an allow-listed origin, never an arbitrary one', () => {
    const mw = corsMiddleware(['https://good.com']);
    const okRes = fakeRes();
    mw({ method: 'GET', headers: { origin: 'https://good.com' } } as never, okRes, () => {});
    expect(okRes.headers['Access-Control-Allow-Origin']).toBe('https://good.com');

    const badRes = fakeRes();
    mw({ method: 'GET', headers: { origin: 'https://evil.com' } } as never, badRes, () => {});
    expect(badRes.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('answers a preflight OPTIONS with 204', () => {
    const res = fakeRes();
    let nextCalled = false;
    corsMiddleware(['https://good.com'])(
      { method: 'OPTIONS', headers: { origin: 'https://good.com' } } as never,
      res,
      () => {
        nextCalled = true;
      },
    );
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(nextCalled).toBe(false);
  });
});
