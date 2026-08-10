import type { KeyResolver, ResolvedKey } from '@vocaliq/provider-router';
import { Provider, ProviderError } from '@vocaliq/shared';
import { type EnvelopeEncryptor, buildEncryptor } from '../crypto/envelope';
import type { PrismaService } from '../db/prisma.service';
import type { KeyPoolService } from '../keypool/keypool.service';

/** Platform key env var per provider (managed mode, single-key fallback). */
const PLATFORM_ENV: Partial<Record<Provider, string>> = {
  [Provider.OPENAI]: 'OPENAI_API_KEY',
  [Provider.ANTHROPIC]: 'ANTHROPIC_API_KEY',
  [Provider.OPENROUTER]: 'OPENROUTER_API_KEY',
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
 * BYOK credentials are envelope-encrypted at rest (Day 57); we decrypt in-memory only at the
 * moment of use and never log the plaintext. The encryptor shares the vault's master key, so
 * what the vault sealed, the resolver can open.
 */
export function buildKeyResolver(
  db: PrismaService,
  keyPool?: KeyPoolService,
  enc: EnvelopeEncryptor = buildEncryptor(),
): KeyResolver {
  return async (tenantId, provider, preferByok): Promise<ResolvedKey> => {
    if (preferByok) {
      const cred = await db.admin.providerCredential.findFirst({
        where: { tenantId, provider, byok: true },
        select: { encryptedKey: true },
      });
      if (cred) {
        return { apiKey: enc.decrypt(cred.encryptedKey), byok: true };
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
