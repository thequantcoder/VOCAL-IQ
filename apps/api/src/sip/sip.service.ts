import {
  NotFoundError,
  type SipTransport,
  ValidationError,
  applyTemplate,
  maskSipUsername,
  sipTrunkCreateSchema,
} from '@vocaliq/shared';
import { z } from 'zod';
import type { EntitlementsService } from '../billing/entitlements.service';
import { PrismaService } from '../db/prisma.service';

/**
 * Explicit, credential-safe DTO. SIP credentials (username/password) are NEVER returned —
 * only a masked username + a `hasCredentials` flag (self-audit C). The full blob lives
 * encrypted-at-rest in `encryptedCreds` and is decrypted only inside the voice service when
 * registering the trunk.
 */
export interface SipTrunkDto {
  id: string;
  name: string;
  providerTemplate: string;
  host: string;
  port: number;
  transport: string;
  inbound: boolean;
  outbound: boolean;
  concurrencyLimit: number;
  authUsernameMasked: string;
  hasCredentials: boolean;
  createdAt: Date;
}

export const sipUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  inbound: z.boolean().optional(),
  outbound: z.boolean().optional(),
  concurrencyLimit: z.number().int().min(1).max(1000).optional(),
});

interface StoredCreds {
  authUsername: string;
  authPassword: string;
  sipDomain?: string;
}

/**
 * NOTE(Day 57 / KMS): real envelope encryption lands with the key vault. Until then creds
 * are serialised to bytes (like ProviderCredential) — persisted server-side, never returned
 * to clients, never logged. The read path only ever exposes a masked username.
 */
function sealCreds(creds: StoredCreds): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(JSON.stringify(creds));
  const out = new Uint8Array(new ArrayBuffer(encoded.byteLength)); // Prisma Bytes = Uint8Array<ArrayBuffer>
  out.set(encoded);
  return out;
}
function openCreds(bytes: Uint8Array): StoredCreds {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as StoredCreds;
  } catch {
    return { authUsername: '', authPassword: '' };
  }
}

type TrunkRow = {
  id: string;
  name: string;
  providerTemplate: string;
  host: string;
  port: number;
  transport: string;
  inbound: boolean;
  outbound: boolean;
  concurrencyLimit: number;
  encryptedCreds: Uint8Array;
  createdAt: Date;
};

function toDto(row: TrunkRow): SipTrunkDto {
  const creds = openCreds(row.encryptedCreds);
  return {
    id: row.id,
    name: row.name,
    providerTemplate: row.providerTemplate,
    host: row.host,
    port: row.port,
    transport: row.transport,
    inbound: row.inbound,
    outbound: row.outbound,
    concurrencyLimit: row.concurrencyLimit,
    authUsernameMasked: creds.authUsername ? maskSipUsername(creds.authUsername) : '',
    hasCredentials: Boolean(creds.authUsername && creds.authPassword),
    createdAt: row.createdAt,
  };
}

const SIP_SELECT = {
  id: true,
  name: true,
  providerTemplate: true,
  host: true,
  port: true,
  transport: true,
  inbound: true,
  outbound: true,
  concurrencyLimit: true,
  encryptedCreds: true,
  createdAt: true,
} as const;

/**
 * BYO-SIP trunk management (Day 35). Operators register their own carrier trunk from a
 * template; creds are sealed at rest and never returned. Per-plan sipLimit is enforced on
 * create (self-audit D). All reads/writes RLS-scoped (self-audit B). The live SIP transport
 * (register/route/place) is the voice service's job — gated until a real trunk is attached.
 */
export class SipService {
  constructor(
    private readonly db: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(tenantId: string): Promise<SipTrunkDto[]> {
    const rows = (await this.db.withTenant(tenantId, (tx) =>
      tx.sipTrunk.findMany({ select: SIP_SELECT, orderBy: { createdAt: 'desc' } }),
    )) as TrunkRow[];
    return rows.map(toDto);
  }

  async get(tenantId: string, id: string): Promise<SipTrunkDto> {
    const row = (await this.db.withTenant(tenantId, (tx) =>
      tx.sipTrunk.findFirst({ where: { id }, select: SIP_SELECT }),
    )) as TrunkRow | null;
    if (!row) throw new NotFoundError('SIP trunk not found');
    return toDto(row);
  }

  async create(tenantId: string, input: unknown): Promise<SipTrunkDto> {
    const parsed = sipTrunkCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid SIP trunk');
    }
    const data = parsed.data;
    const resolved = applyTemplate(data);
    if (!resolved.host) throw new ValidationError('A SIP host is required for this trunk');

    await this.entitlements.assertCanCreateSipTrunk(tenantId);

    const creds: StoredCreds = {
      authUsername: data.credentials.authUsername,
      authPassword: data.credentials.authPassword,
      ...(data.credentials.sipDomain ? { sipDomain: data.credentials.sipDomain } : {}),
    };

    const id = await this.db.withTenant(tenantId, async (tx) => {
      const created = await tx.sipTrunk.create({
        data: {
          tenantId,
          name: data.name,
          providerTemplate: data.providerTemplate,
          host: resolved.host,
          port: resolved.port,
          transport: resolved.transport as SipTransport,
          inbound: data.inbound,
          outbound: data.outbound,
          concurrencyLimit: data.concurrencyLimit,
          encryptedCreds: sealCreds(creds),
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: unknown): Promise<SipTrunkDto> {
    const parsed = sipUpdateSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Invalid SIP trunk update');
    const data = parsed.data;
    await this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.sipTrunk.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('SIP trunk not found');
      await tx.sipTrunk.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.inbound !== undefined ? { inbound: data.inbound } : {}),
          ...(data.outbound !== undefined ? { outbound: data.outbound } : {}),
          ...(data.concurrencyLimit !== undefined
            ? { concurrencyLimit: data.concurrencyLimit }
            : {}),
        },
      });
    });
    return this.get(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<{ id: string }> {
    return this.db.withTenant(tenantId, async (tx) => {
      const existing = await tx.sipTrunk.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundError('SIP trunk not found');
      await tx.sipTrunk.delete({ where: { id } });
      return { id };
    });
  }
}
