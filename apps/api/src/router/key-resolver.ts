import type { KeyResolver, ResolvedKey } from '@vocaliq/provider-router';
import { Provider, ProviderError } from '@vocaliq/shared';
import { PrismaService } from '../db/prisma.service';
import type { KeyPoolService } from '../keypool/keypool.service';

/** Platform key env var per provider (managed mode, single-key fallback). */
const PLATFORM_ENV: Partial<Record<Provider, string>> = {
  [Provider.OPENAI]: 'OPENAI_API_KEY',
  [Provider.ANTHROPIC]: 'ANTHROPIC_API_KEY',
  [Provider.DEEPGRAM]: 'DEEPGRAM_API_KEY',
  [Provider.ELEVENLABS]: 'ELEVENLABS_API_KEY',
};

/**
 * Resolve the API key for a (tenant, provider): tenant BYOK credential first (if preferred
 * + present), else a load-balanced platform key from the `PlatformApiKeyPool` (Day 38 —
 * weighted-LRU with bad-key ejection), falling back to the single env key when the pool is
 * empty. The key is never logged. When the pool serves the key, its `id` rides along as
 * `poolKeyId` so the caller can report the call outcome for health tracking.
 *
 * NOTE: envelope decryption of BYOK credentials is DEFERRED to Day 57 (KMS). Until then
 * `encryptedKey` is read as raw bytes — fine for dev/skeleton, not production.
 */
export function buildKeyResolver(db: PrismaService, keyPool?: KeyPoolService): KeyResolver {
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

    // Managed mode: prefer a load-balanced pool key, then the env fallback.
    if (keyPool) {
      const selected = await keyPool.selectKey(provider);
      if (selected) return { apiKey: selected.apiKey, byok: false, poolKeyId: selected.id };
    }

    const envVar = PLATFORM_ENV[provider];
    const key = envVar ? process.env[envVar] : undefined;
    if (!key) throw new ProviderError(`No platform key configured for ${provider}`);
    return { apiKey: key, byok: false };
  };
}
