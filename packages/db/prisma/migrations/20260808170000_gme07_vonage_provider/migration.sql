-- GME-07: global SMS wave 1 adds Vonage (Plivo + Telnyx are already in the Provider enum as carriers).
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'VONAGE';
