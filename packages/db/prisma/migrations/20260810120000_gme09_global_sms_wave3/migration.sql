-- GME-09: global SMS wave 3 carriers (Amazon SNS, Bandwidth, ClickSend). Clean enum append only.
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'AWS_SNS';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'BANDWIDTH';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'CLICKSEND';
