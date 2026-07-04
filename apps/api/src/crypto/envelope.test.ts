import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EnvelopeEncryptor, LocalMasterKeyProvider, last4, safeEqual } from './envelope';

const masterA = randomBytes(32).toString('base64');
const masterB = randomBytes(32).toString('base64');
const encA = new EnvelopeEncryptor(new LocalMasterKeyProvider(masterA));

describe('EnvelopeEncryptor', () => {
  it('round-trips a secret', () => {
    const secret = 'fake-test-provider-key-value';
    const blob = encA.encrypt(secret);
    expect(encA.decrypt(blob)).toBe(secret);
  });

  it('NEVER leaves the plaintext recoverable from the ciphertext bytes (self-audit C)', () => {
    const secret = 'fake-plaintext-marker-value';
    const blob = encA.encrypt(secret);
    const asText = Buffer.from(blob).toString('utf8');
    const asLatin = Buffer.from(blob).toString('latin1');
    expect(asText).not.toContain(secret);
    expect(asLatin).not.toContain(secret);
    expect(asLatin).not.toContain('plaintext-marker');
  });

  it('produces distinct ciphertexts for the same input (random data key + iv)', () => {
    const a = Buffer.from(encA.encrypt('same')).toString('base64');
    const b = Buffer.from(encA.encrypt('same')).toString('base64');
    expect(a).not.toBe(b);
  });

  it('fails to decrypt under a DIFFERENT master key', () => {
    const blob = encA.encrypt('secret');
    const encB = new EnvelopeEncryptor(new LocalMasterKeyProvider(masterB));
    expect(() => encB.decrypt(blob)).toThrow();
  });

  it('fails to decrypt a tampered ciphertext (GCM auth)', () => {
    const blob = Buffer.from(encA.encrypt('secret'));
    const last = blob.length - 1;
    blob[last] = (blob[last] ?? 0) ^ 0xff; // flip a ciphertext byte
    expect(() => encA.decrypt(blob)).toThrow();
  });

  it('rejects a bad master key length', () => {
    expect(() => new LocalMasterKeyProvider(Buffer.from('short').toString('base64'))).toThrow();
  });
});

describe('helpers', () => {
  it('last4 masks all but the final 4 chars', () => {
    expect(last4('sk-abcdef1234')).toBe('••••1234');
  });
  it('safeEqual compares in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
