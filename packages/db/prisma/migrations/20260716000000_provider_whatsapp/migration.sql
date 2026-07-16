-- WhatsApp Business Calling (WAC-01): add WHATSAPP to the Provider enum, kept in sync with the
-- @vocaliq/shared Provider const. Placed before LIVEKIT to match the schema order.
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'WHATSAPP' BEFORE 'LIVEKIT';
