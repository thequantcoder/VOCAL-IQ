-- Day 78 — Refund idempotency: remember the most recent refund's key so a retried refund (e.g. after
-- a network blip) returns the payment instead of refunding again. Serialized by the FOR UPDATE lock
-- in PaymentsService.refund, so this is race-safe.
ALTER TABLE "Payment" ADD COLUMN "lastRefundKey" TEXT;
