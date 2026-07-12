import { z } from 'zod';

/**
 * Env schema — validated at boot, fail-fast (CODE-PATTERNS §6, CODING-RULES §2).
 *
 * Design: nearly everything is OPTIONAL here so any single app boots without the
 * whole platform's credentials. A feature that NEEDS a key asserts it at the point
 * of use via `requireEnv()` (so the failure names the feature + the missing var),
 * rather than blocking startup globally. Var names mirror PREREQUISITES.md /
 * .env.example exactly.
 *
 * Rule: secrets ONLY come from env/secrets manager — never hard-coded, never logged.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),

  // App ports (coerced from strings; sensible defaults so local dev just runs).
  API_PORT: z.coerce.number().int().positive().default(3001),
  VOICE_PORT: z.coerce.number().int().positive().default(8000),

  // ── Datastores ──────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url().optional(), // owner role: migrations, seed, admin
  DIRECT_URL: z.string().url().optional(),
  /** Runtime app role (non-superuser) — RLS-constrained. Falls back to DATABASE_URL. */
  APP_DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // ── Storage (Cloudflare R2) ─────────────────────────────────────────────────
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),

  // ── Auth (Clerk) ────────────────────────────────────────────────────────────
  CLERK_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  /** Svix signing secret for Clerk webhooks (user.created/updated) — whsec_… */
  CLERK_WEBHOOK_SECRET: z.string().optional(),

  // ── Telephony + media ───────────────────────────────────────────────────────
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  // Telnyx (alternative carrier — number provisioning + Call Control telephony).
  TELNYX_API_KEY: z.string().optional(),
  TELNYX_CONNECTION_ID: z.string().optional(),
  // Plivo (alternative carrier — number provisioning + Voice API telephony).
  PLIVO_AUTH_ID: z.string().optional(),
  PLIVO_AUTH_TOKEN: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),

  // ── AI providers (STT/TTS/LLM/embeddings) ───────────────────────────────────
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),

  // ── Billing (Stripe) ────────────────────────────────────────────────────────
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // ── Observability + email ───────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),

  // ── Secrets manager ─────────────────────────────────────────────────────────
  DOPPLER_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse + validate process.env. Throws a single, readable error listing every
 * invalid var so misconfiguration fails fast and loud at boot. NOTE: error text
 * names the offending vars and Zod's message — it never echoes the *values*.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty strings as unset. Env files (and our .env.example) carry blank
  // placeholders like `FOO=`; without this, `z.string().url().optional()` would
  // reject `""` instead of skipping it.
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== '') cleaned[key] = value;
  }
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

/**
 * Assert that specific env vars are present for a feature about to run. Use this
 * at the edge of a feature (e.g. "outbound calling needs TWILIO_*") so the error
 * names what's missing and why — instead of a vague null deref later.
 *
 * Returns a record of the requested keys narrowed to non-undefined strings.
 */
export function requireEnv<K extends keyof Env>(
  env: Env,
  keys: readonly K[],
  feature?: string,
): { [P in K]: NonNullable<Env[P]> } {
  const missing = keys.filter((k) => env[k] === undefined || env[k] === '');
  if (missing.length > 0) {
    const where = feature ? ` for ${feature}` : '';
    throw new Error(`Missing required environment${where}: ${missing.join(', ')}`);
  }
  // Safe: every key was verified present above.
  return Object.fromEntries(keys.map((k) => [k, env[k]])) as {
    [P in K]: NonNullable<Env[P]>;
  };
}
