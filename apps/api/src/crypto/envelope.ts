import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Envelope encryption for provider secrets (Day 57). Each secret gets a fresh random 256-bit
 * DATA key; the plaintext is sealed with AES-256-GCM under that data key; the data key itself is
 * WRAPPED under a master key. Only the wrapped data key + ciphertext are ever persisted — the
 * plaintext key never touches the DB, logs, or an API response (self-audit C, the critical
 * property). The master key lives behind a `MasterKeyProvider` seam so a cloud KMS (AWS/GCP)
 * swaps in for the local key with no change to callers.
 *
 * Wire format of the returned blob (all lengths big-endian):
 *   [1 byte version=1][2 bytes wrappedLen][wrapped data key][12 bytes iv][16 bytes gcm tag][ciphertext]
 */

let devWarned = false;
function warnDevMasterOnce(): void {
  if (devWarned) return;
  devWarned = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[vault] VAULT_MASTER_KEY not set — using a DEV-ONLY derived master key. Do NOT use in production.',
  );
}

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const DATA_KEY_LEN = 32;

/** Wraps/unwraps a data key. Local implementation now; a KMS implementation later (same shape). */
export interface MasterKeyProvider {
  readonly name: string;
  wrapDataKey(dataKey: Buffer): Buffer;
  unwrapDataKey(wrapped: Buffer): Buffer;
}

/**
 * Local master key from `VAULT_MASTER_KEY` (base64, 32 bytes). Fully functional + self-hostable —
 * the default for on-prem installs. If the env var is absent we derive a DEV-ONLY key from a
 * fixed label so tests + local dev run; that path logs a loud warning and must never be used in
 * production (set VAULT_MASTER_KEY, or wire a KMS provider).
 */
export class LocalMasterKeyProvider implements MasterKeyProvider {
  readonly name = 'local';
  private readonly master: Buffer;

  constructor(rawBase64?: string) {
    if (rawBase64) {
      const key = Buffer.from(rawBase64, 'base64');
      if (key.length !== 32) {
        throw new Error('VAULT_MASTER_KEY must be 32 bytes (base64-encoded).');
      }
      this.master = key;
    } else {
      // Dev/test fallback — deterministic so restarts can still decrypt, but NOT for production.
      warnDevMasterOnce();
      this.master = scryptSync('vocaliq-dev-master', 'vocaliq-vault-salt', 32);
    }
  }

  /** Wrap the data key with AES-256-GCM under the master key (iv+tag prepended). */
  wrapDataKey(dataKey: Buffer): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.master, iv);
    const ct = Buffer.concat([cipher.update(dataKey), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]);
  }

  unwrapDataKey(wrapped: Buffer): Buffer {
    const iv = wrapped.subarray(0, IV_LEN);
    const tag = wrapped.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = wrapped.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.master, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}

export class EnvelopeEncryptor {
  constructor(private readonly master: MasterKeyProvider) {}

  /** Seal a plaintext secret into an opaque blob (safe to persist as Prisma Bytes). */
  encrypt(plaintext: string): Uint8Array<ArrayBuffer> {
    const dataKey = randomBytes(DATA_KEY_LEN);
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const wrapped = this.master.wrapDataKey(dataKey);

    const header = Buffer.alloc(3);
    header.writeUInt8(VERSION, 0);
    header.writeUInt16BE(wrapped.length, 1);
    const blob = Buffer.concat([header, wrapped, iv, tag, ct]);
    // Prisma Bytes wants Uint8Array<ArrayBuffer>; return a copy backed by a plain ArrayBuffer.
    const out = new Uint8Array(new ArrayBuffer(blob.byteLength));
    out.set(blob);
    return out;
  }

  /** Open a blob produced by `encrypt`. Throws on tamper (GCM auth) or a wrong master key. */
  decrypt(blob: Uint8Array): string {
    const buf = Buffer.from(blob);
    if (buf.length < 3 || buf.readUInt8(0) !== VERSION) {
      throw new Error('Unrecognized ciphertext (bad version header).');
    }
    const wrappedLen = buf.readUInt16BE(1);
    let off = 3;
    const wrapped = buf.subarray(off, off + wrappedLen);
    off += wrappedLen;
    const iv = buf.subarray(off, off + IV_LEN);
    off += IV_LEN;
    const tag = buf.subarray(off, off + TAG_LEN);
    off += TAG_LEN;
    const ct = buf.subarray(off);

    const dataKey = this.master.unwrapDataKey(wrapped);
    const decipher = createDecipheriv('aes-256-gcm', dataKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }
}

/**
 * Build the encryptor from env. A real KMS (AWS/GCP) is selected when `KMS_KEY_ID` is set — that
 * implementation is a future swap into this same seam (memory: gated external deps); until then
 * the local master key is used, which is production-grade for self-hosted installs.
 */
export function buildEncryptor(env: NodeJS.ProcessEnv = process.env): EnvelopeEncryptor {
  return new EnvelopeEncryptor(new LocalMasterKeyProvider(env.VAULT_MASTER_KEY));
}

/** A masked hint (last 4) so operators can identify a key without ever seeing it. */
export function last4(secret: string): string {
  return `••••${secret.slice(-4)}`;
}

/** Constant-time compare, for callers that must verify a secret without leaking timing. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
