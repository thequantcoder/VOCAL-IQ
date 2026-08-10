-- Messenger (Meta) Calling (MEC-01): add MESSENGER to the Provider + CallChannel enums, kept in sync
-- with the @vocaliq/shared consts. Provider.MESSENGER meters Messenger call carrier cost (free-tier
-- default) via UsageRecord; CallChannel.MESSENGER lets a Messenger call link to the unified Call (MEC-04).
-- Placed before LIVEKIT (Provider) / after WHATSAPP (CallChannel) to match the schema order.
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'MESSENGER' BEFORE 'LIVEKIT';
ALTER TYPE "CallChannel" ADD VALUE IF NOT EXISTS 'MESSENGER';
