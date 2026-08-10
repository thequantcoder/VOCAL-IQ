-- GME-10: India SMS wave 2 carriers (Kaleyra, Fast2SMS, Textlocal, Route Mobile). Clean enum append only.
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'KALEYRA';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'FAST2SMS';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'TEXTLOCAL';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'ROUTE_MOBILE';
