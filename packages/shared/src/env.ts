import { z } from 'zod';

/**
 * Env schema — validated at boot, fail-fast (CODE-PATTERNS §6, CODING-RULES §2).
 * Day 0 keeps only what the scaffold needs; later days extend this as providers
 * come online. Required vars throw at startup; optional vars degrade gracefully.
 *
 * Rule: secrets ONLY come from env/secrets manager — never hard-coded.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),

  // Core datastores (wired in Phase 0–1 — optional at Day 0 so the scaffold boots)
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse + validate process.env. Throws a single, readable error listing every
 * missing/invalid var so misconfiguration fails fast and loud at boot.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
