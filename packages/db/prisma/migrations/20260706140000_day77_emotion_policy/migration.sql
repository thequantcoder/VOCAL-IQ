-- Day 77 — Emotion-aware voice modulation: per-agent policy (opt-in, tenant-isolated via Agent RLS).
-- One policy per agent, stored as JSON on the Agent row (mirrors "llmPolicy"). Default '{}' resolves
-- to a disabled policy in application code, so existing agents are unchanged (neutral voice).
ALTER TABLE "Agent" ADD COLUMN "emotionPolicy" JSONB NOT NULL DEFAULT '{}';
