-- GME-08: global SMS wave 2 carriers (Sinch, MessageBird/Bird, Infobip). Clean enum append only.
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'SINCH';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'MESSAGEBIRD';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'INFOBIP';
