-- Add PLIVO to the Provider enum (3rd telephony carrier + number provisioning).
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'PLIVO';
