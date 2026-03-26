-- Add email verification + terms acceptance to users
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "terms_accepted_at"  TIMESTAMP(3);

-- Existing users are considered verified (retroactive)
UPDATE "users" SET "email_verified_at" = NOW() WHERE "email_verified_at" IS NULL;

-- Audit log table for LGPD compliance + enterprise contracts
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   UUID         NOT NULL,
  "user_id"     UUID,
  "action"      TEXT         NOT NULL,
  "entity_type" TEXT,
  "entity_id"   TEXT,
  "metadata"    JSONB,
  "ip_address"  TEXT,
  "user_agent"  TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ix_audit_logs_tenant"   ON "audit_logs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "ix_audit_logs_timeline" ON "audit_logs" ("tenant_id", "created_at" DESC);
