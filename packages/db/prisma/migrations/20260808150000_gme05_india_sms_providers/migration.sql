-- GME-05: India SMS carriers (MSG91 + Gupshup). Clean enum append only.
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'MSG91';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'GUPSHUP';
