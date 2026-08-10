import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

/** Self-hosted password hashing (bcrypt) — stack pivot, replaces Clerk. */

describe('hashPassword / verifyPassword', () => {
  it('hashes and verifies the correct password', async () => {
    const hash = await hashPassword('s3cret-pass');
    expect(hash).not.toBe('s3cret-pass'); // never plaintext
    expect(await verifyPassword('s3cret-pass', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('s3cret-pass');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces distinct hashes for the same input (salted)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same', a)).toBe(true);
    expect(await verifyPassword('same', b)).toBe(true);
  });
});
