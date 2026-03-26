-- Migration: add is_internal to messages + campaigns table

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "is_internal" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"    UUID        NOT NULL,
  "name"         TEXT        NOT NULL,
  "message"      TEXT        NOT NULL,
  "target_tag"   TEXT,
  "status"       TEXT        NOT NULL DEFAULT 'draft',
  "sent_count"   INTEGER     NOT NULL DEFAULT 0,
  "failed_count" INTEGER     NOT NULL DEFAULT 0,
  "scheduled_at" TIMESTAMP(3),
  "started_at"   TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaigns_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ix_campaigns_tenant_status" ON "campaigns"("tenant_id", "status");
