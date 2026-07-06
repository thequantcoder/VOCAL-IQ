-- Day 79 — Advanced dialer modes: per-campaign dialer config (progressive/power/predictive +
-- pacing + abandon-rate cap). One JSON blob (like retryPolicy); RLS inherited from Campaign.
-- Default '{}' resolves to progressive/pure-AI in application code, so existing campaigns are unchanged.
ALTER TABLE "Campaign" ADD COLUMN "dialerConfig" JSONB NOT NULL DEFAULT '{}';
