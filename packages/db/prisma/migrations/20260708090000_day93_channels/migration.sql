-- Day 93 — Additional messaging channels: Telegram, Facebook Messenger, Instagram DM, RCS.
-- Extend the MessageChannel enum so the existing (channel-generic) messaging runtime — templates,
-- send, opt-out, cost, campaign channelMix — serves these surfaces too. Postgres 12+ allows
-- ADD VALUE inside a migration as long as the new values aren't used in the same transaction (they
-- aren't here). IF NOT EXISTS keeps the migration idempotent.
ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'TELEGRAM';
ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'MESSENGER';
ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'RCS';
