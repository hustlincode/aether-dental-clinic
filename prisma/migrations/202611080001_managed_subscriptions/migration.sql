-- Add subscription dates without changing clinic ownership or clinical records.
BEGIN;

CREATE TYPE "SubscriptionMode" AS ENUM ('INTERNAL', 'TRIAL', 'PAID');

ALTER TABLE "tenants"
  ADD COLUMN "subscription_mode" "SubscriptionMode" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "subscription_ends_at" TIMESTAMPTZ(3) DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days');

-- Preserve the original owner's access. Other existing clinics receive 30 days.
UPDATE "tenants"
SET "subscription_mode" = 'INTERNAL', "subscription_ends_at" = NULL
WHERE "slug" = 'aether';

COMMIT;
