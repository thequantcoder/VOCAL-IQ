-- GME-04: meter messaging (SMS/RCS/WhatsApp/…) into the unified cost pipeline (UsageRecord). Clean
-- enum append only (matching the prior provider-enum migrations) — no destructive drift.
ALTER TYPE "Capability" ADD VALUE IF NOT EXISTS 'messaging';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'TELEGRAM';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'RCS';
