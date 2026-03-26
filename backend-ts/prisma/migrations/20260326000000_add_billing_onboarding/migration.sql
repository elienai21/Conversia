-- Add billing and onboarding fields to tenants table
-- Safe for Railway deploy: all columns use IF NOT EXISTS + defaults

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "plan"                   TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS "plan_status"            TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS "trial_ends_at"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "stripe_customer_id"     TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_subscription_id" TEXT,
  ADD COLUMN IF NOT EXISTS "onboarding_step"        INTEGER NOT NULL DEFAULT 0;

-- Existing tenants: set trial_ends_at retroactively (14 days from now)
UPDATE "tenants"
  SET "trial_ends_at" = NOW() + INTERVAL '14 days'
  WHERE "trial_ends_at" IS NULL;
