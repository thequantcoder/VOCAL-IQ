import type { KeyResolver, ResolvedKey } from '@vocaliq/provider-router';
import { Provider, ProviderError } from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';

/** Platform key env var per provider (managed mode). */
const PLATFORM_ENV: Partial<Record<Provider, string>> = {
  [Provider.OPENAI]: 'OPENAI_API_KEY',
  [Provider.ANTHROPIC]: 'ANTHROPIC_API_KEY',
  [Provider.DEEPGRAM]: 'DEEPGRAM_API_KEY',
  [Provider.ELEVENLABS]: 'ELEVENLABS_API_KEY',
};

/**
 * Resolve the API key for a (tenant, provider): tenant BYOK credential first (if
 * preferred + present), else the platform key from env. The key is never logged.
 *
 * NOTE: envelope decryption of BYOK credentials is DEFERRED to Day 57 (KMS). Until
 * then `encryptedKey` is read as raw bytes — fine for dev/skeleton, not production.
 */
export function buildKeyResolver(db: PrismaService): KeyResolver {
  return async (tenantId, provider, preferByok): Promise<ResolvedKey> => {
    if (preferByok) {
      const cred = await db.admin.providerCredential.findFirst({
        where: { tenantId, provider, byok: true },
        select: { encryptedKey: true },
      });
      if (cred) {
        // TODO(Day 57): KMS envelope-decrypt cred.encryptedKey in-memory.
        return { apiKey: Buffer.from(cred.encryptedKey).toString('utf8'), byok: true };
      }
    }
    const envVar = PLATFORM_ENV[provider];
    const key = envVar ? process.env[envVar] : undefined;
    if (!key) throw new ProviderError(`No platform key configured for ${provider}`);
    return { apiKey: key, byok: false };
  };
}
